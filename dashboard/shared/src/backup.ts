import { z } from 'zod';

/** Automatic backups (SPEC §11): daily at 04:00 in the user's time zone, keep the last 7. */
export const BACKUP_DEFAULTS = { enabled: true, hour: 4, minute: 0, keep: 7 } as const;

export const backupSettingsSchema = z.object({
  enabled: z.boolean(),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  keep: z.number().int().min(1).max(30),
  /** IANA time zone of the browser that saved the settings ("Europe/Berlin"). */
  timeZone: z.string().min(1).max(64),
});
export type BackupSettings = z.infer<typeof backupSettingsSchema>;

/** Optional password for a downloaded backup (encryption recommended: it holds VPN keys). */
export const createBackupSchema = z.object({
  password: z.string().min(8).max(256).optional(),
});

export const backupFileNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.easyarr$/, 'invalid backup file name');

/** Where a restore reads its file from: the last upload or an automatic backup. */
export const restoreSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('upload') }),
  z.object({ kind: z.literal('file'), name: backupFileNameSchema }),
]);
export type RestoreSource = z.infer<typeof restoreSourceSchema>;

export const restoreRequestSchema = z.object({
  source: restoreSourceSchema,
  password: z.string().max(256).optional(),
});
export type RestoreRequest = z.infer<typeof restoreRequestSchema>;

/** Services that bring their own backup (D-070); the rest are set up again from EasyArr's state. */
export const NATIVE_BACKUP_SERVICES = [
  'sonarr',
  'radarr',
  'lidarr',
  'prowlarr',
  'jellyfin',
] as const;
export type NativeBackupService = (typeof NATIVE_BACKUP_SERVICES)[number];

export interface BackupFileView {
  name: string;
  size: number;
  /** ISO time the file was written. */
  createdAt: string;
}

export interface BackupSettingsView extends BackupSettings {
  /** Last automatic backup attempt. */
  lastAuto: { at: string; ok: boolean; error: string | null } | null;
  files: BackupFileView[];
}

/** What the restore screen shows before the user confirms. */
export interface RestoreSummary {
  createdAt: string;
  appVersion: string;
  kind: 'manual' | 'automatic';
  encrypted: boolean;
  /** false = encrypted and no (correct) password given yet: only the fields above are known. */
  unlocked: boolean;
  /** Services whose own backup is inside (full history), e.g. ["sonarr", "jellyfin"]. */
  native: string[];
  /** Services whose own backup couldn't be made when the backup was created. */
  skipped: { part: string; reason: string }[];
  setup: {
    account: string | null;
    downloadMethod: string | null;
    vpnProvider: string | null;
    libraries: string[];
    finished: boolean;
  } | null;
}

export type RestoreStepId = 'easyarr' | NativeBackupService | 'connections' | 'vpn' | 'wiring';

export type RestoreStepState = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export type RestoreEvent =
  | { type: 'start'; steps: RestoreStepId[] }
  | {
      type: 'step';
      step: RestoreStepId;
      state: RestoreStepState;
      /** Plain error text + the service's validation details (D-054 style). */
      error?: { message: string; details: string[] };
      /** web: backup.restore.note.<code> */
      note?: 'fallback' | 'vpn_failed' | 'wiring_problems' | 'vpn_skipped';
    }
  | { type: 'end'; ok: boolean };
