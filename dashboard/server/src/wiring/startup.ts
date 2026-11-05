import type { SystemInfo } from '@easyarr/shared';
import type { Logger } from 'pino';
import { stateStore } from '../state/index.js';
import type { WiringEngine } from './engine.js';
import { planFromState } from './routes.js';

export interface StartupWiringOptions {
  engine: Pick<WiringEngine, 'run' | 'isRunning'>;
  stateDir: string;
  collectSystemInfo: () => Promise<SystemInfo>;
  log?: Logger;
  /**
   * Wait before each attempt. The services start together with the dashboard, so the first run
   * waits a little; a failed run (a service still starting, the VPN not up yet) is retried later.
   */
  delaysMs?: number[];
  setTimer?: (fn: () => void, ms: number) => { cancel: () => void };
}

const DEFAULT_DELAYS_MS = [30_000, 2 * 60_000, 10 * 60_000];

/**
 * SPEC §10: the wiring runs again, silently, every time the app starts — after the setup is
 * finished. That's how an update's wiring changes (e.g. a new Recyclarr config) reach existing
 * installs, and how something missing gets added back (the engine never re-creates what the user
 * deleted outside "repair", D-047).
 */
export function startupWiring(opts: StartupWiringOptions): { start: () => void; stop: () => void } {
  const delays = opts.delaysMs ?? DEFAULT_DELAYS_MS;
  const setTimer =
    opts.setTimer ??
    ((fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      t.unref();
      return { cancel: () => clearTimeout(t) };
    });
  let timer: { cancel: () => void } | undefined;
  let stopped = false;

  const schedule = (attempt: number) => {
    const delay = delays[attempt];
    if (stopped || delay === undefined) return;
    timer = setTimer(() => void attemptRun(attempt), delay);
  };

  const attemptRun = async (attempt: number) => {
    if (stopped) return;
    try {
      const { value: state } = await stateStore(opts.stateDir).load();
      // Before the setup is done, the Finish step owns the wiring.
      if (!state.wizard.completedSteps.includes('finish')) return;
      if (opts.engine.isRunning) {
        schedule(attempt + 1);
        return;
      }
      const plan = planFromState(state, await opts.collectSystemInfo());
      const result = await opts.engine.run('startup', plan);
      opts.log?.info({ attempt: attempt + 1, ...result }, 'startup wiring finished');
      if (!result.ok) schedule(attempt + 1);
    } catch (err) {
      opts.log?.warn({ err, attempt: attempt + 1 }, 'startup wiring failed');
      schedule(attempt + 1);
    }
  };

  return {
    start: () => schedule(0),
    stop: () => {
      stopped = true;
      timer?.cancel();
    },
  };
}
