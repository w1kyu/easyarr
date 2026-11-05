import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SystemInfo } from '@easyarr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultState, stateStore, type State } from '../state/index.js';
import type { WiringMode, WiringPlan } from './engine.js';
import { startupWiring } from './startup.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'easyarr-startup-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const system = async () => ({ gpu: { kind: 'none', devices: [] } }) as unknown as SystemInfo;

async function writeState(finished: boolean) {
  const s: State = {
    ...defaultState(),
    account: { username: 'owner', passwordHash: 'x', updatedAt: '2026-11-05T00:00:00Z' },
    wizard: {
      completedSteps: finished ? ['account', 'download', 'finish'] : ['account', 'download'],
      answers: { download: { method: 'torrents' } },
    },
  };
  await stateStore(dir).save(s);
}

/** Timers run when the test says so. */
function manualTimers() {
  const pending: { fn: () => void; ms: number }[] = [];
  return {
    pending,
    setTimer: (fn: () => void, ms: number) => {
      const t = { fn, ms };
      pending.push(t);
      return { cancel: () => pending.splice(pending.indexOf(t), 1) };
    },
    /** Fires the next timer and waits for its run to settle. */
    async fire() {
      const t = pending.shift();
      if (!t) throw new Error('no timer pending');
      t.fn();
      await new Promise((r) => setTimeout(r, 20));
      return t.ms;
    },
  };
}

function fakeEngine(results: boolean[]) {
  const runs: { mode: WiringMode; plan: WiringPlan }[] = [];
  return {
    runs,
    isRunning: false,
    async run(mode: WiringMode, plan: WiringPlan) {
      runs.push({ mode, plan });
      return { ok: results[runs.length - 1] ?? true, changes: 0 };
    },
  };
}

describe('startupWiring', () => {
  it('runs the wiring silently in startup mode once the setup is finished', async () => {
    await writeState(true);
    const timers = manualTimers();
    const engine = fakeEngine([true]);
    startupWiring({ engine, stateDir: dir, collectSystemInfo: system, ...timers }).start();
    expect(await timers.fire()).toBe(30_000);
    expect(engine.runs).toHaveLength(1);
    expect(engine.runs[0]?.mode).toBe('startup');
    expect(engine.runs[0]?.plan.torrents).toBe(true);
    expect(timers.pending).toHaveLength(0); // ok → no retry
  });

  it('leaves the wiring to the Finish step while the setup is not done', async () => {
    await writeState(false);
    const timers = manualTimers();
    const engine = fakeEngine([]);
    startupWiring({ engine, stateDir: dir, collectSystemInfo: system, ...timers }).start();
    await timers.fire();
    expect(engine.runs).toHaveLength(0);
    expect(timers.pending).toHaveLength(0);
  });

  it('retries a failed run later, then gives up', async () => {
    await writeState(true);
    const timers = manualTimers();
    const engine = fakeEngine([false, false, false]);
    startupWiring({
      engine,
      stateDir: dir,
      collectSystemInfo: system,
      delaysMs: [1, 2, 3],
      ...timers,
    }).start();
    expect([await timers.fire(), await timers.fire(), await timers.fire()]).toEqual([1, 2, 3]);
    expect(engine.runs).toHaveLength(3);
    expect(timers.pending).toHaveLength(0);
  });

  it('waits for a run that is already going (e.g. the user pressed Repair)', async () => {
    await writeState(true);
    const timers = manualTimers();
    const engine = fakeEngine([true]);
    engine.isRunning = true;
    startupWiring({ engine, stateDir: dir, collectSystemInfo: system, ...timers }).start();
    await timers.fire();
    expect(engine.runs).toHaveLength(0);
    engine.isRunning = false;
    await timers.fire();
    expect(engine.runs).toHaveLength(1);
  });

  it('stop() cancels the pending run', async () => {
    await writeState(true);
    const timers = manualTimers();
    const engine = fakeEngine([]);
    const s = startupWiring({ engine, stateDir: dir, collectSystemInfo: system, ...timers });
    s.start();
    s.stop();
    expect(timers.pending).toHaveLength(0);
  });
});
