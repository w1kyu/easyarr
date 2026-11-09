import { describe, expect, it } from 'vitest';
import type { LedgerEntry, WiringRunSummary } from '../state/index.js';
import {
  WiringBusyError,
  WiringEngine,
  type LedgerStore,
  type WiringEvent,
  type WiringPlan,
  type WiringStep,
} from './engine.js';
import { ServiceError } from './http.js';

class MemoryLedger implements LedgerStore {
  ledger: LedgerEntry[] = [];
  applied: string[] = [];
  runs: WiringRunSummary[] = [];
  async read() {
    return { ledger: [...this.ledger], applied: [...this.applied] };
  }
  async upsert(e: LedgerEntry) {
    this.ledger = [...this.ledger.filter((x) => x.key !== e.key), e];
  }
  async markApplied(key: string) {
    if (!this.applied.includes(key)) this.applied.push(key);
  }
  async finish(s: WiringRunSummary) {
    this.runs.push(s);
  }
}

/** A fake service holding named things with ids. */
class FakeService {
  items = new Map<string, { name: string; value: string }>();
  setting: string | null = null;
  next = 1;
  creates = 0;
  add(name: string, value = 'default'): string {
    const id = String(this.next++);
    this.items.set(id, { name, value });
    this.creates += 1;
    return id;
  }
}

const plan: WiringPlan = {
  torrents: true,
  usenet: false,
  libraries: { movies: true, tv: true, music: false },
  quality: 'balanced',
  languages: ['original', 'en'],
  language: 'en',
  country: 'US',
  usenetServers: [],
  usenetIndexers: [],
  gpu: false,
};

function setup() {
  const svc = new FakeService();
  const store = new MemoryLedger();
  const steps: WiringStep[] = [
    {
      id: 'sonarr.downloadclient',
      service: 'sonarr',
      needs: ['sonarr', 'qbittorrent'],
      enabled: (p) => p.torrents,
      run: async (ctx) => {
        await ctx.resource({
          key: 'sonarr.downloadclient.qbittorrent',
          kind: 'downloadclient',
          name: 'EasyArr – qBittorrent',
          exists: async (id) => svc.items.has(id),
          find: async () =>
            [...svc.items.entries()].find(([, v]) => v.name === 'EasyArr – qBittorrent')?.[0] ??
            null,
          create: async () => svc.add('EasyArr – qBittorrent'),
        });
        await ctx.once('sonarr.hardlinks', async () => {
          svc.setting = 'hardlinks-on';
          return true;
        });
      },
    },
    {
      id: 'sabnzbd.servers',
      service: 'sabnzbd',
      needs: ['sabnzbd'],
      enabled: (p) => p.usenet,
      run: async () => {
        throw new Error('must not run: usenet is off');
      },
    },
  ];
  const engine = new WiringEngine({
    steps,
    health: { sonarr: async () => true, qbittorrent: async () => true },
    store,
    sleep: async () => undefined,
  });
  return { svc, store, engine };
}

describe('wiring engine (SPEC §10.2)', () => {
  it('creates what is missing and only runs enabled steps', async () => {
    const { svc, store, engine } = setup();
    const events: WiringEvent[] = [];
    const r = await engine.run('run', plan, (e) => events.push(e));
    expect(r).toEqual({ ok: true, changes: 2 });
    expect(svc.creates).toBe(1);
    expect(svc.setting).toBe('hardlinks-on');
    expect(store.ledger).toMatchObject([
      { key: 'sonarr.downloadclient.qbittorrent', service: 'sonarr', id: '1', adopted: false },
    ]);
    expect(events[0]).toEqual({
      type: 'start',
      mode: 'run',
      steps: [{ id: 'sonarr.downloadclient', service: 'sonarr' }],
    });
    expect(events.at(-1)).toEqual({ type: 'end', ok: true, changes: 2 });
    expect(store.runs).toMatchObject([{ mode: 'run', ok: true, changes: 2 }]);
  });

  it('is idempotent: a second run changes nothing', async () => {
    const { svc, engine } = setup();
    await engine.run('run', plan);
    const r = await engine.run('run', plan);
    expect(r.changes).toBe(0);
    expect(svc.creates).toBe(1);
  });

  it('never overwrites user changes: a changed resource and a changed setting stay', async () => {
    const { svc, engine } = setup();
    await engine.run('run', plan);
    const item = svc.items.get('1');
    if (item) item.value = 'user-changed';
    svc.setting = 'user-turned-it-off';
    const r = await engine.run('run', plan);
    expect(r.changes).toBe(0);
    expect(svc.items.get('1')?.value).toBe('user-changed');
    expect(svc.setting).toBe('user-turned-it-off');
  });

  it('respects deletions; repair re-creates them (but not one-time settings)', async () => {
    const { svc, store, engine } = setup();
    await engine.run('run', plan);
    svc.items.delete('1');
    svc.setting = null;
    const events: WiringEvent[] = [];
    const r = await engine.run('run', plan, (e) => events.push(e));
    expect(r.changes).toBe(0);
    expect(svc.items.size).toBe(0);
    const done = events.find((e) => e.type === 'step' && e.state === 'done');
    expect(done).toMatchObject({
      notes: [{ code: 'deleted_by_user', name: 'EasyArr – qBittorrent' }],
    });

    const repair = await engine.run('repair', plan);
    expect(repair.changes).toBe(1);
    expect(svc.items.size).toBe(1);
    expect(svc.setting).toBeNull();
    expect(store.ledger[0]?.id).toBe('2');
  });

  it('adopts an equivalent resource instead of creating a duplicate', async () => {
    const { svc, store, engine } = setup();
    svc.add('EasyArr – qBittorrent'); // e.g. a run that crashed before recording it
    svc.creates = 0;
    const events: WiringEvent[] = [];
    await engine.run('run', plan, (e) => events.push(e));
    expect(svc.creates).toBe(0);
    expect(store.ledger[0]).toMatchObject({ id: '1', adopted: true });
    expect(JSON.stringify(events)).toContain('"code":"adopted"');
  });

  it('a failing step reports a plain error code and the run continues', async () => {
    const store = new MemoryLedger();
    let ran = false;
    const engine = new WiringEngine({
      store,
      health: {},
      steps: [
        {
          id: 'a',
          service: 'radarr',
          needs: [],
          enabled: () => true,
          run: async () => {
            throw new ServiceError('radarr', 'rejected', 'POST /x → HTTP 400', 400, [
              'Path: must exist',
            ]);
          },
        },
        {
          id: 'b',
          service: 'sonarr',
          needs: [],
          enabled: () => true,
          run: async () => {
            ran = true;
          },
        },
      ],
    });
    const events: WiringEvent[] = [];
    const r = await engine.run('run', plan, (e) => events.push(e));
    expect(r.ok).toBe(false);
    expect(ran).toBe(true);
    expect(events.find((e) => e.type === 'step' && e.state === 'failed')).toMatchObject({
      step: 'a',
      error: { code: 'rejected', service: 'radarr', details: ['Path: must exist'] },
    });
    expect(store.runs[0]).toMatchObject({ ok: false });
  });

  it('a service that never comes up fails its steps as unreachable, probed once', async () => {
    let probes = 0;
    const t = { now: 0 };
    const engine = new WiringEngine({
      store: new MemoryLedger(),
      readyTimeoutMs: 5000,
      sleep: async (ms) => {
        t.now += ms;
      },
      health: {
        sonarr: async () => {
          probes += 1;
          throw new ServiceError('sonarr', 'unreachable', 'connect ECONNREFUSED');
        },
      },
      steps: ['x', 'y'].map((id) => ({
        id,
        service: 'sonarr' as const,
        needs: ['sonarr' as const],
        enabled: () => true,
        run: async () => undefined,
      })),
    });
    const realNow = Date.now;
    Date.now = () => t.now;
    try {
      const events: WiringEvent[] = [];
      await engine.run('run', plan, (e) => events.push(e));
      const failed = events.filter((e) => e.type === 'step' && e.state === 'failed');
      expect(failed).toHaveLength(2);
      expect(failed[0]).toMatchObject({ error: { code: 'unreachable', service: 'sonarr' } });
      const probesAfter = probes;
      expect(probesAfter).toBeGreaterThan(1);
      expect(probesAfter).toBeLessThan(10);
    } finally {
      Date.now = realNow;
    }
  });

  it('refuses a second run while one is in progress', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const engine = new WiringEngine({
      store: new MemoryLedger(),
      health: {},
      steps: [{ id: 's', service: 'sonarr', needs: [], enabled: () => true, run: () => gate }],
    });
    const first = engine.run('run', plan);
    await expect(engine.run('run', plan)).rejects.toBeInstanceOf(WiringBusyError);
    release();
    await first;
    expect(engine.isRunning).toBe(false);
  });
});
