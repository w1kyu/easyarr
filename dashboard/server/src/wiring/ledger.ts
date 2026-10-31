import type { WiringRunSummary, LedgerEntry } from '../state/index.js';
import { stateStore } from '../state/index.js';
import type { Mutex } from '../state/mutex.js';
import type { LedgerStore } from './engine.js';

/** The wiring ledger in state.json (SPEC §7.2), written under the shared state lock. */
export class StateLedgerStore implements LedgerStore {
  constructor(
    private readonly stateDir: string,
    private readonly lock: Mutex,
  ) {}

  private update(
    fn: (w: { ledger: LedgerEntry[]; applied: string[]; lastRun: WiringRunSummary | null }) => void,
  ) {
    return this.lock.run(async () => {
      const store = stateStore(this.stateDir);
      const { value } = await store.load();
      const wiring = {
        ...value.wiring,
        ledger: [...value.wiring.ledger],
        applied: [...value.wiring.applied],
      };
      fn(wiring);
      await store.save({ ...value, wiring });
    });
  }

  async read(): Promise<{ ledger: LedgerEntry[]; applied: string[] }> {
    const { value } = await stateStore(this.stateDir).load();
    return { ledger: value.wiring.ledger, applied: value.wiring.applied };
  }

  upsert(entry: LedgerEntry): Promise<void> {
    return this.update((w) => {
      w.ledger = [...w.ledger.filter((e) => e.key !== entry.key), entry];
    });
  }

  markApplied(key: string): Promise<void> {
    return this.update((w) => {
      if (!w.applied.includes(key)) w.applied.push(key);
    });
  }

  finish(summary: WiringRunSummary): Promise<void> {
    return this.update((w) => {
      w.lastRun = summary;
    });
  }
}
