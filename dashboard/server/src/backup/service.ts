import { promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  APP_NAME,
  BACKUP_DEFAULTS,
  backupFileNameSchema,
  NATIVE_BACKUP_SERVICES,
  parseWizardAnswers,
  type BackupFileView,
  type BackupSettings,
  type BackupSettingsView,
  type NativeBackupService,
  type RestoreEvent,
  type RestoreSource,
  type RestoreStepId,
  type RestoreSummary,
  type SystemInfo,
  type VpnConfigInput,
} from '@easyarr/shared';
import type { Logger } from 'pino';
import { ApiError } from '../http-errors.js';
import { registerSecrets } from '../logger.js';
import { secretValues, usedServices } from '../status/service.js';
import type { Mutex } from '../state/mutex.js';
import {
  secretsStore,
  stateStore,
  type Secrets,
  type State,
  SECRETS_SCHEMA_VERSION,
  STATE_SCHEMA_VERSION,
} from '../state/index.js';
import type { WiringEngine } from '../wiring/engine.js';
import { ServiceError } from '../wiring/http.js';
import { planFromState } from '../wiring/routes.js';
import {
  BACKUP_EXTENSION,
  backupFileName,
  BackupFormatError,
  readBackup,
  readManifest,
  writeBackup,
  type BackupManifest,
} from './format.js';

/** What a native backup needs to log in to a service. */
export interface NativeContext {
  keys: Record<string, string>;
  /** Accounts to try for Jellyfin (this install's, then the backup's). */
  accounts: { username: string; password: string }[];
}

/** The services' own backups (real: ./native-ops.ts; tests: fakes). */
export interface NativeOps {
  create(id: NativeBackupService, ctx: NativeContext): Promise<Buffer>;
  restore(id: NativeBackupService, data: Buffer, ctx: NativeContext): Promise<void>;
  /** Puts this install's keys back into connections inside the restored apps (D-071). */
  fixConnections(restored: NativeBackupService[], keys: Record<string, string>): Promise<number>;
}

export interface VpnOps {
  save(input: VpnConfigInput): Promise<unknown>;
  /** Restart the tunnel even if the settings file didn't change (same VPN as before). */
  reconnect(): Promise<void>;
  test(): Promise<{ ok: boolean }>;
}

export interface BackupServiceOptions {
  stateDir: string;
  /** Automatic backups: EasyArr/backups in Umbrel's Files (SPEC §11). */
  backupsDir: string;
  version: string;
  lock: Mutex;
  native: NativeOps;
  vpn: VpnOps;
  wiring: Pick<WiringEngine, 'run' | 'isRunning'>;
  collectSystemInfo: () => Promise<SystemInfo>;
  log?: Logger;
  now?: () => Date;
  /** Tests use cheap scrypt parameters. */
  scryptParams?: { N: number; r: number; p: number };
  setTimer?: (fn: () => void, ms: number) => { cancel: () => void };
}

/** Files we write for automatic backups (and prune). Downloads are never stored. */
const AUTO_NAME = /^easyarr-backup-\d{4}-\d{2}-\d{2}-\d{4}\.easyarr$/;

const STATE_FILE = 'easyarr/state.json';
const SECRETS_FILE = 'easyarr/secrets.json';
const nativeFile = (id: string) => `native/${id}.zip`;

/** "jellyfin.languages:de" → "jellyfin", "sonarr.hardlinks" → "sonarr". */
const appliedService = (key: string) => key.split(/[.:]/)[0] ?? key;

function localParts(date: Date, timeZone: string) {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
  } catch {
    tz = 'UTC';
  }
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return {
    tz,
    day: `${p['year']}-${p['month']}-${p['day']}`,
    hour: Number(p['hour']),
    minute: Number(p['minute']),
  };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const errorView = (err: unknown) => ({
  message: errorText(err),
  details: err instanceof ServiceError ? (err.details ?? []) : [],
});

/**
 * Backup & restore (SPEC §11, D-015, D-069 – D-071).
 * - Create: EasyArr's state + secrets (state replay, always works) + the services' own backups.
 * - Automatic: once a day at the chosen local time, keep the newest N, in EasyArr/backups.
 * - Restore: state → native backups → connection keys → VPN → wiring check, streamed as events.
 */
export class BackupService {
  private busy: 'backup' | 'restore' | null = null;
  private timer: { cancel: () => void } | undefined;

  constructor(private readonly opts: BackupServiceOptions) {}

  private now(): Date {
    return (this.opts.now ?? (() => new Date()))();
  }

  get isBusy(): boolean {
    return this.busy !== null;
  }

  private uploadPath(): string {
    return path.join(this.opts.stateDir, 'restore', `upload${BACKUP_EXTENSION}`);
  }

  // --- settings + files -------------------------------------------------------------------------

  private settingsFrom(
    state: State,
  ): BackupSettings & { lastAuto: NonNullable<State['backups']>['lastAuto'] } {
    return state.backups ?? { ...BACKUP_DEFAULTS, timeZone: 'UTC', lastAuto: null };
  }

  async view(): Promise<BackupSettingsView> {
    const { value: state } = await stateStore(this.opts.stateDir).load();
    const s = this.settingsFrom(state);
    return {
      enabled: s.enabled,
      hour: s.hour,
      minute: s.minute,
      keep: s.keep,
      timeZone: s.timeZone,
      lastAuto: s.lastAuto
        ? { at: s.lastAuto.at, ok: s.lastAuto.ok, error: s.lastAuto.error }
        : null,
      files: await this.files(),
    };
  }

  async saveSettings(input: BackupSettings): Promise<BackupSettingsView> {
    await this.opts.lock.run(async () => {
      const store = stateStore(this.opts.stateDir);
      const { value: state } = await store.load();
      const lastAuto = state.backups?.lastAuto ?? null;
      await store.save({ ...state, backups: { ...input, lastAuto } });
    });
    await this.prune();
    return this.view();
  }

  async files(): Promise<BackupFileView[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.opts.backupsDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const out: BackupFileView[] = [];
    for (const name of names) {
      if (!backupFileNameSchema.safeParse(name).success) continue;
      const st = await fs.stat(path.join(this.opts.backupsDir, name)).catch(() => null);
      if (st?.isFile()) out.push({ name, size: st.size, createdAt: st.mtime.toISOString() });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private filePath(name: string): string {
    if (!backupFileNameSchema.safeParse(name).success) throw new ApiError(400, 'invalid_name');
    return path.join(this.opts.backupsDir, name);
  }

  async readFile(name: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.filePath(name));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new ApiError(404, 'not_found');
      throw err;
    }
  }

  async deleteFile(name: string): Promise<void> {
    try {
      await fs.unlink(this.filePath(name));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new ApiError(404, 'not_found');
      throw err;
    }
  }

  /** Keeps the newest `keep` automatic backups; files the user put there by other names stay. */
  private async prune(): Promise<void> {
    const { value: state } = await stateStore(this.opts.stateDir).load();
    const keep = this.settingsFrom(state).keep;
    const auto = (await this.files()).filter((f) => AUTO_NAME.test(f.name));
    for (const f of auto.slice(keep)) {
      await fs.unlink(path.join(this.opts.backupsDir, f.name)).catch(() => undefined);
    }
  }

  // --- create -----------------------------------------------------------------------------------

  private async exclusive<T>(kind: 'backup' | 'restore', fn: () => Promise<T>): Promise<T> {
    if (this.busy)
      throw new ApiError(409, this.busy === 'restore' ? 'restore_running' : 'backup_running');
    if (this.opts.wiring.isRunning) throw new ApiError(409, 'wiring_running');
    this.busy = kind;
    try {
      return await fn();
    } finally {
      this.busy = null;
    }
  }

  /** Builds a backup file. Native backups that fail are listed as skipped, never fatal. */
  async create(
    kind: BackupManifest['kind'],
    password?: string,
  ): Promise<{ name: string; data: Buffer; manifest: BackupManifest }> {
    return this.exclusive('backup', async () => {
      // Load first: creates/migrates the files, so the raw copies below are current.
      const { value: state } = await stateStore(this.opts.stateDir).load();
      const { value: secrets } = await secretsStore(this.opts.stateDir).load();
      const stateRaw = await fs.readFile(stateStore(this.opts.stateDir).file);
      const secretsRaw = await fs.readFile(secretsStore(this.opts.stateDir).file);
      const used = usedServices(state);
      const files: { name: string; data: Buffer }[] = [
        { name: STATE_FILE, data: stateRaw },
        { name: SECRETS_FILE, data: secretsRaw },
      ];
      const parts = ['easyarr'];
      const skipped: BackupManifest['skipped'] = [];
      const ctx: NativeContext = {
        keys: secrets.apiKeys,
        accounts:
          state.account && secrets.account
            ? [{ username: state.account.username, password: secrets.account.password }]
            : [],
      };
      // Until the wiring has run once the services hold nothing worth keeping. (Not "setup
      // finished": a changed answer re-opens Finish (D-053), and a nightly backup taken then must
      // still contain the services' own backups.)
      const wired = state.wiring.lastRun !== null;
      for (const id of NATIVE_BACKUP_SERVICES) {
        if (!wired || !used.has(id)) continue;
        try {
          files.push({ name: nativeFile(id), data: await this.opts.native.create(id, ctx) });
          parts.push(id);
        } catch (err) {
          this.opts.log?.warn({ service: id, err: errorText(err) }, 'native backup failed');
          skipped.push({ part: id, reason: errorText(err).slice(0, 300) });
        }
      }
      const createdAt = this.now();
      const data = await writeBackup({
        createdAt,
        app: { name: APP_NAME, version: this.opts.version },
        kind,
        parts,
        skipped,
        files,
        password,
        ...(this.opts.scryptParams ? { scryptParams: this.opts.scryptParams } : {}),
      });
      const tz = this.settingsFrom(state).timeZone;
      const manifest = readManifest(data);
      this.opts.log?.info(
        { kind, parts, skipped: skipped.map((s) => s.part), size: data.length },
        'backup created',
      );
      return { name: backupFileName(createdAt, tz), data, manifest };
    });
  }

  /** The automatic backup: written to EasyArr/backups, then old ones pruned. */
  async runAutomatic(): Promise<void> {
    const at = this.now();
    const { value: state } = await stateStore(this.opts.stateDir).load();
    const s = this.settingsFrom(state);
    const { day } = localParts(at, s.timeZone);
    let result: { ok: boolean; error: string | null };
    try {
      const { name, data } = await this.create('automatic');
      await fs.mkdir(this.opts.backupsDir, { recursive: true });
      // Binary-safe atomic write: temp file + rename (writeFileAtomic is text-only).
      const tmp = path.join(this.opts.backupsDir, `.${name}.tmp`);
      await fs.writeFile(tmp, data, { mode: 0o600 });
      await fs.rename(tmp, path.join(this.opts.backupsDir, name));
      await this.prune();
      result = { ok: true, error: null };
    } catch (err) {
      this.opts.log?.error({ err: errorText(err) }, 'automatic backup failed');
      result = { ok: false, error: errorText(err).slice(0, 300) };
    }
    await this.opts.lock.run(async () => {
      const store = stateStore(this.opts.stateDir);
      const { value: st } = await store.load();
      const cur = this.settingsFrom(st);
      await store.save({
        ...st,
        backups: {
          enabled: cur.enabled,
          hour: cur.hour,
          minute: cur.minute,
          keep: cur.keep,
          timeZone: cur.timeZone,
          lastAuto: { at: at.toISOString(), day, ...result },
        },
      });
    });
  }

  /** Is an automatic backup due? Once a day, at or after the chosen time (catches missed runs). */
  async due(): Promise<boolean> {
    if (this.busy) return false;
    const { value: state } = await stateStore(this.opts.stateDir).load();
    // Nothing to keep before the apps were set up for the first time.
    if (state.wiring.lastRun === null) return false;
    const s = this.settingsFrom(state);
    if (!s.enabled) return false;
    const now = localParts(this.now(), s.timeZone);
    if (s.lastAuto?.day === now.day) return false;
    return now.hour * 60 + now.minute >= s.hour * 60 + s.minute;
  }

  start(): void {
    const setTimer =
      this.opts.setTimer ??
      ((fn: () => void, ms: number) => {
        const t = setInterval(fn, ms);
        t.unref();
        return { cancel: () => clearInterval(t) };
      });
    this.timer = setTimer(() => {
      void (async () => {
        try {
          if (await this.due()) await this.runAutomatic();
        } catch (err) {
          this.opts.log?.warn({ err: errorText(err) }, 'backup schedule check failed');
        }
      })();
    }, 60_000);
  }

  stop(): void {
    this.timer?.cancel();
  }

  // --- restore ----------------------------------------------------------------------------------

  /** Stores an uploaded file for the restore screen (one at a time) and returns its manifest. */
  async saveUpload(data: Buffer): Promise<RestoreSummary> {
    const manifest = this.manifestOf(data);
    const file = this.uploadPath();
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(file, data, { mode: 0o600 });
    return this.summaryFrom(manifest, null);
  }

  private manifestOf(data: Buffer): BackupManifest {
    try {
      return readManifest(data);
    } catch (err) {
      if (err instanceof BackupFormatError) throw new ApiError(400, err.code);
      throw err;
    }
  }

  private async sourceData(source: RestoreSource): Promise<Buffer> {
    if (source.kind === 'file') return this.readFile(source.name);
    try {
      return await fs.readFile(this.uploadPath());
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new ApiError(404, 'no_upload');
      throw err;
    }
  }

  /** Opens + validates a backup, including the state/secrets inside (migrated to this version). */
  private async open(source: RestoreSource, password?: string) {
    const data = await this.sourceData(source);
    let opened;
    try {
      opened = await readBackup(data, { password });
    } catch (err) {
      if (err instanceof BackupFormatError) throw new ApiError(400, err.code);
      throw err;
    }
    const stateRaw = opened.files.get(STATE_FILE);
    const secretsRaw = opened.files.get(SECRETS_FILE);
    if (!stateRaw || !secretsRaw) throw new ApiError(400, 'corrupted');
    // Same loader as at start-up: migrations for older EasyArr versions, refusal of newer ones.
    for (const [raw, current] of [
      [stateRaw, STATE_SCHEMA_VERSION],
      [secretsRaw, SECRETS_SCHEMA_VERSION],
    ] as const) {
      let v: unknown;
      try {
        v = (JSON.parse(raw.toString('utf8')) as { schemaVersion?: unknown }).schemaVersion;
      } catch {
        throw new ApiError(400, 'corrupted');
      }
      if (typeof v === 'number' && v > current) throw new ApiError(400, 'newer_format');
    }
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'easyarr-restore-'));
    try {
      await fs.writeFile(path.join(tmp, 'state.json'), stateRaw, { mode: 0o600 });
      await fs.writeFile(path.join(tmp, 'secrets.json'), secretsRaw, { mode: 0o600 });
      const state = (await stateStore(tmp).load()).value;
      const secrets = (await secretsStore(tmp).load()).value;
      return { manifest: opened.manifest, files: opened.files, state, secrets };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(400, 'corrupted');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  private summaryFrom(manifest: BackupManifest, state: State | null): RestoreSummary {
    const answers = state ? parseWizardAnswers(state.wizard.answers) : null;
    const libs = answers?.library?.libraries ?? { movies: true, tv: true, music: true };
    return {
      createdAt: manifest.createdAt,
      appVersion: manifest.app.version,
      kind: manifest.kind,
      encrypted: manifest.encrypted,
      unlocked: state !== null,
      native: manifest.parts.filter((p) => p !== 'easyarr'),
      skipped: manifest.skipped,
      setup: state
        ? {
            account: state.account?.username ?? null,
            downloadMethod: answers?.download?.method ?? null,
            vpnProvider:
              state.vpn?.provider ?? (answers?.vpn?.mode === 'skipped' ? 'skipped' : null),
            libraries: (Object.keys(libs) as (keyof typeof libs)[]).filter((k) => libs[k]),
            finished: state.wizard.completedSteps.includes('finish'),
          }
        : null,
    };
  }

  /** What's inside (after the password, if any). Wrong password → 400 wrong_password. */
  async inspect(source: RestoreSource, password?: string): Promise<RestoreSummary> {
    const data = await this.sourceData(source);
    const manifest = this.manifestOf(data);
    if (manifest.encrypted && !password) return this.summaryFrom(manifest, null);
    const { state } = await this.open(source, password);
    return this.summaryFrom(manifest, state);
  }

  /** The restore itself (SPEC §11): see the class comment for the order. */
  async prepareRestore(
    source: RestoreSource,
    password: string | undefined,
  ): Promise<(emit: (e: RestoreEvent) => void) => Promise<{ ok: boolean }>> {
    // Validate first, so a bad file or password answers as a plain 400 before streaming starts.
    const backup = await this.open(source, password);
    if (this.busy)
      throw new ApiError(409, this.busy === 'restore' ? 'restore_running' : 'backup_running');
    if (this.opts.wiring.isRunning) throw new ApiError(409, 'wiring_running');
    return (emit) => this.exclusive('restore', () => this.runRestore(backup, emit));
  }

  private async runRestore(
    backup: Awaited<ReturnType<BackupService['open']>>,
    emit: (e: RestoreEvent) => void,
  ): Promise<{ ok: boolean }> {
    const log = this.opts.log;
    const native = NATIVE_BACKUP_SERVICES.filter(
      (id) => backup.manifest.parts.includes(id) && backup.files.has(nativeFile(id)),
    );
    const steps: RestoreStepId[] = ['easyarr', ...native, 'connections', 'vpn', 'wiring'];
    emit({ type: 'start', steps });
    let ok = true;
    const step = (s: RestoreStepId, state: 'running' | 'done' | 'skipped') =>
      emit({ type: 'step', step: s, state });
    const fail = (s: RestoreStepId, err: unknown, note?: 'fallback') => {
      ok = false;
      log?.warn({ step: s, err: errorText(err) }, 'restore step failed');
      emit({
        type: 'step',
        step: s,
        state: 'failed',
        error: errorView(err),
        ...(note ? { note } : {}),
      });
    };

    // 1. EasyArr's own state. This install's API keys stay (D-071): its other services already
    //    use them; restored native backups are re-keyed to match. Everything else comes back.
    step('easyarr', 'running');
    const stateFile = stateStore(this.opts.stateDir);
    const secretsFile = secretsStore(this.opts.stateDir);
    const current = (await secretsFile.load()).value;
    const currentState = (await stateFile.load()).value;
    const restoredNative = new Set<NativeBackupService>(native);
    const prune = (st: State): State => ({
      ...st,
      wiring: {
        // Services set up fresh must be wired as new; restored ones keep their resource ids.
        ledger: st.wiring.ledger.filter((e) =>
          restoredNative.has(e.service as NativeBackupService),
        ),
        applied: st.wiring.applied.filter((k) =>
          restoredNative.has(appliedService(k) as NativeBackupService),
        ),
        lastRun: null,
      },
    });
    const secrets: Secrets = { ...backup.secrets, apiKeys: current.apiKeys };
    try {
      registerSecrets(secretValues(secrets));
      await this.opts.lock.run(async () => {
        await secretsFile.save(secrets);
        await stateFile.save(
          prune({
            ...backup.state,
            // The automatic-backup schedule belongs to this device, not the file.
            ...(currentState.backups ? { backups: currentState.backups } : {}),
          }),
        );
      });
      step('easyarr', 'done');
    } catch (err) {
      fail('easyarr', err);
      emit({ type: 'end', ok: false });
      return { ok: false };
    }

    // 2. The services' own backups. A failure falls back to state replay for that service.
    const accounts = [
      ...(currentState.account && current.account
        ? [{ username: currentState.account.username, password: current.account.password }]
        : []),
      ...(backup.state.account && backup.secrets.account
        ? [{ username: backup.state.account.username, password: backup.secrets.account.password }]
        : []),
    ];
    for (const id of native) {
      step(id, 'running');
      try {
        await this.opts.native.restore(id, backup.files.get(nativeFile(id)) as Buffer, {
          keys: current.apiKeys,
          accounts,
        });
        step(id, 'done');
      } catch (err) {
        restoredNative.delete(id);
        fail(id, err, 'fallback');
      }
    }
    if (restoredNative.size !== native.length) {
      // Forget the ledger of services that fell back, so the wiring sets them up again.
      await this.opts.lock.run(async () => {
        const { value: st } = await stateFile.load();
        await stateFile.save(prune(st));
      });
    }

    // 3. Connections inside restored apps → this install's keys.
    step('connections', 'running');
    try {
      await this.opts.native.fixConnections([...restoredNative], current.apiKeys);
      step('connections', 'done');
    } catch (err) {
      fail('connections', err);
    }

    // 4. VPN: write the settings for the VPN container again and test the connection.
    const restored = (await stateFile.load()).value;
    const restoredSecrets = (await secretsFile.load()).value;
    if (restored.vpn) {
      step('vpn', 'running');
      try {
        await this.opts.vpn.save({
          provider: restored.vpn.provider,
          protocol: restored.vpn.protocol,
          locations: restored.vpn.locations,
          portForwarding: restored.vpn.portForwarding,
          forwardedPort: restored.vpn.forwardedPort,
          freePlan: restored.vpn.freePlan,
          fields: { ...restored.vpn.fields, ...(restoredSecrets.vpn?.fields ?? {}) },
        });
        // The VPN container restarts only when its settings change; restoring the same VPN
        // wouldn't, and the test would wait for a restart that never comes.
        await this.opts.vpn.reconnect();
        const test = await this.opts.vpn.test();
        if (test.ok) step('vpn', 'done');
        else {
          ok = false;
          emit({ type: 'step', step: 'vpn', state: 'failed', note: 'vpn_failed' });
        }
      } catch (err) {
        fail('vpn', err);
      }
    } else {
      emit({ type: 'step', step: 'vpn', state: 'skipped', note: 'vpn_skipped' });
    }

    // 5. Wiring check: connects the services set up fresh, confirms the restored ones.
    if (restored.account && restored.wizard.completedSteps.includes('finish')) {
      step('wiring', 'running');
      try {
        const plan = planFromState(restored, await this.opts.collectSystemInfo());
        const result = await this.opts.wiring.run('run', plan);
        if (result.ok) step('wiring', 'done');
        else {
          ok = false;
          emit({ type: 'step', step: 'wiring', state: 'failed', note: 'wiring_problems' });
        }
      } catch (err) {
        fail('wiring', err);
      }
    } else {
      // An unfinished setup: the wizard continues where the backup left off.
      step('wiring', 'skipped');
    }

    await fs.unlink(this.uploadPath()).catch(() => undefined);
    log?.info({ ok, native: [...restoredNative] }, 'restore finished');
    emit({ type: 'end', ok });
    return { ok };
  }
}
