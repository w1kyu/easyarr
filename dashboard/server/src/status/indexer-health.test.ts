import type { ServiceId } from '@easyarr/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../wiring/testing/fake-world.js';
import { IndexerHealer, type IndexerHealerDeps } from './indexer-health.js';

const later = () => new Date(Date.now() + 6 * 3600_000).toISOString();
const earlier = () => new Date(Date.now() - 60_000).toISOString();

function setup(over: Partial<IndexerHealerDeps> = {}) {
  const w = new World();
  const prowlarr = w.arr.prowlarr;
  const nyaa = prowlarr.coll('indexer').add({ name: 'Nyaa', enable: true }) as { id: number };
  const x1337 = prowlarr.coll('indexer').add({ name: '1337x', enable: true }) as { id: number };
  const off = prowlarr.coll('indexer').add({ name: 'Off', enable: false }) as { id: number };
  const sonarrIdx = w.arr.sonarr.coll('indexer').add({
    name: 'Nyaa (Prowlarr)',
    enableRss: true,
    enableAutomaticSearch: true,
  }) as { id: number };
  const d = w.deps();
  const deps: IndexerHealerDeps = {
    url: d.url,
    keys: d.keys,
    canReach: async () => true,
    used: async () => new Set<ServiceId>(['sonarr', 'radarr']),
  };
  if (d.fetch) deps.fetch = d.fetch;
  const healer = new IndexerHealer(Object.assign(deps, over));
  return { w, healer, ids: { nyaa: nyaa.id, x1337: x1337.id, off: off.id, sonarr: sonarrIdx.id } };
}

describe('IndexerHealer', () => {
  it('tests paused search sites, which clears the pause once they answer again', async () => {
    const { w, healer, ids } = setup();
    const p = w.arr.prowlarr;
    p.paused.set(ids.nyaa, later());
    p.paused.set(ids.x1337, earlier()); // pause already over: leave it alone
    p.paused.set(ids.off, later()); // disabled by the user: leave it alone
    w.arr.sonarr.paused.set(ids.sonarr, later());

    expect(await healer.runOnce()).toBe('checked');
    expect(p.tests).toEqual([ids.nyaa]);
    expect(p.paused.has(ids.nyaa)).toBe(false);
    expect(w.arr.sonarr.tests).toEqual([ids.sonarr]);
    expect(w.arr.sonarr.paused.size).toBe(0);
    expect(healer.last()).toMatchObject({ total: 2, blocked: 0 });
  });

  it('leaves Sonarr & co alone while every Prowlarr site is still unreachable', async () => {
    const { w, healer, ids } = setup();
    const p = w.arr.prowlarr;
    for (const id of [ids.nyaa, ids.x1337]) {
      p.paused.set(id, later());
      p.unreachable.add(id);
    }
    w.arr.sonarr.paused.set(ids.sonarr, later());

    expect(await healer.runOnce()).toBe('checked');
    expect(p.tests.sort()).toEqual([ids.nyaa, ids.x1337].sort());
    expect(p.paused.size).toBe(2);
    expect(w.arr.sonarr.tests).toEqual([]);
    expect(healer.last()).toMatchObject({ total: 2, blocked: 2 });

    // The sites come back: the next round resumes everything.
    p.unreachable.clear();
    await healer.runOnce();
    expect(p.paused.size).toBe(0);
    expect(w.arr.sonarr.paused.size).toBe(0);
    expect(healer.last()).toMatchObject({ blocked: 0 });
  });

  it('does nothing while the VPN is down (a test would only lengthen the pause)', async () => {
    const { w, healer, ids } = setup({ canReach: async () => false });
    w.arr.prowlarr.paused.set(ids.nyaa, later());
    expect(await healer.runOnce()).toBe('skipped');
    expect(w.arr.prowlarr.tests).toEqual([]);
  });

  it('skips apps the setup does not use', async () => {
    const { w, healer } = setup({ used: async () => new Set<ServiceId>(['radarr']) });
    const lid = w.arr.lidarr.coll('indexer').add({ name: 'x', enableRss: true }) as { id: number };
    w.arr.lidarr.paused.set(lid.id, later());
    await healer.runOnce();
    expect(w.arr.lidarr.tests).toEqual([]);
  });

  it('reports a failed check instead of throwing, and forgets the last result', async () => {
    const { healer } = setup({ keys: async () => ({}) });
    expect(await healer.runOnce()).toBe('failed');
    expect(healer.last()).toBeNull();
  });
});
