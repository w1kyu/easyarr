import type { ServiceId } from '@easyarr/shared';
import type { Logger } from 'pino';
import type { LedgerEntry, WiringRunSummary } from '../state/index.js';
import { ServiceError, waitUntilReady, type ServiceErrorCode } from './http.js';

/** What the wizard answers switch on (SPEC §10: only wire what is enabled). */
export interface WiringPlan {
  torrents: boolean;
  usenet: boolean;
  libraries: { movies: boolean; tv: boolean; music: boolean };
  quality: 'best' | 'balanced' | 'small';
  /** The GPU check found a usable device (SPEC §18). */
  gpu: boolean;
}

/**
 * - run: add what's missing; resources the user deleted stay deleted (SPEC §10.2).
 * - repair: also re-create resources EasyArr made that are gone ("Repair connections").
 * - startup: same as run, silently on app start.
 */
export type WiringMode = WiringRunSummary['mode'];

export type StepState = 'pending' | 'waiting' | 'running' | 'done' | 'failed' | 'skipped';

export interface WiringNote {
  /** web: wiring.note.<code> */
  code: 'deleted_by_user' | 'recreated' | 'adopted';
  /** Name of the resource in the service (e.g. "EasyArr – qBittorrent"). */
  name: string;
}

export interface StepError {
  code: ServiceErrorCode | 'internal';
  service: string;
  message: string;
  details: string[];
}

export type WiringEvent =
  | { type: 'start'; mode: WiringMode; steps: { id: string; service: ServiceId }[] }
  | {
      type: 'step';
      step: string;
      service: ServiceId;
      state: StepState;
      changes?: number;
      notes?: WiringNote[];
      error?: StepError;
    }
  | { type: 'end'; ok: boolean; changes: number };

/** A thing the engine creates in a service (download client, root folder, library, …). */
export interface ResourceSpec {
  /** Stable logical key, unique across services, e.g. "sonarr.downloadclient.qbittorrent". */
  key: string;
  kind: string;
  /** Display name, prefixed "EasyArr – …" where the service shows names (SPEC §10.2). */
  name: string;
  /** Does the resource with this id (from the ledger) still exist? */
  exists(id: string): Promise<boolean>;
  /** An equivalent resource that exists already (made by the user or an interrupted run) → its id. */
  find(): Promise<string | null>;
  /** Create it → its id. */
  create(): Promise<string>;
}

export interface WiringStep {
  /** Stable id; the web shows `wiring.step.<id>`. */
  id: string;
  service: ServiceId;
  /** Services that must answer before this step runs. */
  needs: ServiceId[] | ((plan: WiringPlan) => ServiceId[]);
  enabled(plan: WiringPlan): boolean;
  run(ctx: StepContext): Promise<void>;
}

/** Where the ledger lives (state.json in production, memory in tests). */
export interface LedgerStore {
  read(): Promise<{ ledger: LedgerEntry[]; applied: string[] }>;
  upsert(entry: LedgerEntry): Promise<void>;
  markApplied(key: string): Promise<void>;
  finish(summary: WiringRunSummary): Promise<void>;
}

export class WiringBusyError extends Error {
  constructor() {
    super('wiring is already running');
  }
}

export class StepContext {
  changes = 0;
  readonly notes: WiringNote[] = [];

  constructor(
    readonly step: WiringStep,
    readonly mode: WiringMode,
    readonly plan: WiringPlan,
    private readonly store: LedgerStore,
    private readonly snapshot: { ledger: LedgerEntry[]; applied: string[] },
    private readonly now: () => Date,
    readonly log?: Logger,
  ) {}

  /** The ledger entry for a key, if EasyArr created/adopted it before. */
  entry(key: string): LedgerEntry | undefined {
    return this.snapshot.ledger.find((e) => e.key === key);
  }

  private async record(spec: ResourceSpec, id: string, adopted: boolean): Promise<void> {
    const entry: LedgerEntry = {
      key: spec.key,
      service: this.step.service,
      kind: spec.kind,
      id,
      name: spec.name,
      createdAt: this.now().toISOString(),
      adopted,
    };
    // Persist right away: a crash after create() but before recording would otherwise
    // make the next run treat our own resource as foreign (find() still catches that).
    await this.store.upsert(entry);
    this.snapshot.ledger = [...this.snapshot.ledger.filter((e) => e.key !== spec.key), entry];
  }

  /**
   * Ensures a resource exists, following SPEC §10.2:
   * - known + present → leave it alone, even if the user changed it;
   * - known + gone → the user deleted it: skip (note), unless mode is "repair";
   * - unknown → adopt an equivalent one, else create it.
   * Returns its id, or null when it was deleted by the user and not re-created.
   */
  async resource(spec: ResourceSpec): Promise<string | null> {
    const known = this.entry(spec.key);
    if (known) {
      if (await spec.exists(known.id)) return known.id;
      if (this.mode !== 'repair') {
        this.notes.push({ code: 'deleted_by_user', name: known.name });
        return null;
      }
      const found = await spec.find();
      const id = found ?? (await spec.create());
      if (!found) this.changes += 1;
      await this.record(spec, id, found !== null);
      this.notes.push({ code: 'recreated', name: spec.name });
      return id;
    }
    const found = await spec.find();
    if (found !== null) {
      await this.record(spec, found, true);
      this.notes.push({ code: 'adopted', name: spec.name });
      return found;
    }
    const id = await spec.create();
    this.changes += 1;
    await this.record(spec, id, false);
    return id;
  }

  /**
   * Applies a setting once. Afterwards it's the user's: EasyArr never re-applies it, not even
   * on repair (only connections are repaired). Returns true if it was applied now.
   */
  async once(key: string, apply: () => Promise<boolean | undefined>): Promise<boolean> {
    if (this.snapshot.applied.includes(key)) return false;
    const changed = await apply();
    if (changed !== false) this.changes += 1;
    await this.store.markApplied(key);
    this.snapshot.applied = [...this.snapshot.applied, key];
    return changed !== false;
  }

  /** Counts a change made outside resource()/once() (e.g. a value EasyArr owns was fixed). */
  changed(n = 1): void {
    this.changes += n;
  }
}

export interface EngineOptions {
  steps: readonly WiringStep[];
  /** One readiness probe per service (resolves when it answers its API). */
  health: Partial<Record<ServiceId, () => Promise<unknown>>>;
  store: LedgerStore;
  log?: Logger;
  /** How long to wait for a service to come up (default 3 min: first starts run migrations). */
  readyTimeoutMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

function toStepError(err: unknown, service: string): StepError {
  if (err instanceof ServiceError) {
    return {
      code: err.code,
      service: err.service,
      message: err.message,
      details: err.details ?? [],
    };
  }
  return {
    code: 'internal',
    service,
    message: (err as Error)?.message ?? String(err),
    details: [],
  };
}

/**
 * The wiring engine (SPEC §10): ordered steps, each waiting for the services it needs, reporting
 * progress events for the live checklist. One run at a time. A failed step doesn't stop the
 * others; steps of a service that never came up fail fast with the same reason.
 */
export class WiringEngine {
  private running = false;

  constructor(private readonly opts: EngineOptions) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** Steps that would run for this plan, in order. */
  stepsFor(plan: WiringPlan): WiringStep[] {
    return this.opts.steps.filter((s) => s.enabled(plan));
  }

  async run(
    mode: WiringMode,
    plan: WiringPlan,
    emit: (e: WiringEvent) => void = () => undefined,
  ): Promise<{ ok: boolean; changes: number }> {
    if (this.running) throw new WiringBusyError();
    this.running = true;
    const now = this.opts.now ?? (() => new Date());
    try {
      const steps = this.stepsFor(plan);
      emit({ type: 'start', mode, steps: steps.map((s) => ({ id: s.id, service: s.service })) });
      const snapshot = await this.opts.store.read();
      const ready = new Map<ServiceId, Promise<void>>();
      const waitFor = (id: ServiceId): Promise<void> => {
        let p = ready.get(id);
        if (!p) {
          const probe = this.opts.health[id];
          p = probe
            ? waitUntilReady(probe, {
                timeoutMs: this.opts.readyTimeoutMs ?? 180_000,
                ...(this.opts.sleep ? { sleep: this.opts.sleep } : {}),
              }).then(() => undefined)
            : Promise.resolve();
          ready.set(id, p);
        }
        return p;
      };

      let ok = true;
      let total = 0;
      for (const step of steps) {
        const base = { type: 'step' as const, step: step.id, service: step.service };
        emit({ ...base, state: 'waiting' });
        let current: ServiceId = step.service;
        let ctx: StepContext | undefined;
        try {
          const needs = typeof step.needs === 'function' ? step.needs(plan) : step.needs;
          for (const need of needs) {
            current = need;
            await waitFor(need);
          }
          current = step.service;
          emit({ ...base, state: 'running' });
          ctx = new StepContext(step, mode, plan, this.opts.store, snapshot, now, this.opts.log);
          await step.run(ctx);
          total += ctx.changes;
          emit({ ...base, state: 'done', changes: ctx.changes, notes: ctx.notes });
          this.opts.log?.info(
            { step: step.id, changes: ctx.changes, notes: ctx.notes },
            'wiring step done',
          );
        } catch (err) {
          ok = false;
          const error = toStepError(err, current);
          // What the step did before failing still counts (and its notes still matter).
          const changes = ctx?.changes ?? 0;
          total += changes;
          this.opts.log?.warn({ step: step.id, error, changes }, 'wiring step failed');
          emit({ ...base, state: 'failed', error, changes, notes: ctx?.notes ?? [] });
        }
      }
      await this.opts.store.finish({ at: now().toISOString(), mode, ok, changes: total });
      emit({ type: 'end', ok, changes: total });
      return { ok, changes: total };
    } finally {
      this.running = false;
    }
  }
}
