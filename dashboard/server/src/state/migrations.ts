/**
 * Ordered migrations. Each one takes the document at `from` and returns it at `from + 1`.
 * Migrations must be pure and never drop data they don't understand.
 */
export interface Migration {
  from: number;
  migrate: (doc: Record<string, unknown>) => Record<string, unknown>;
}

export function migrate(
  doc: Record<string, unknown>,
  targetVersion: number,
  migrations: readonly Migration[],
): { doc: Record<string, unknown>; migrated: boolean } {
  let current = doc;
  let version = typeof current['schemaVersion'] === 'number' ? current['schemaVersion'] : 0;
  if (version > targetVersion) {
    throw new Error(
      `File was written by a newer EasyArr (schema ${version}, this version understands ${targetVersion}). Update EasyArr.`,
    );
  }
  let migrated = false;
  while (version < targetVersion) {
    const step = migrations.find((m) => m.from === version);
    if (!step) throw new Error(`No migration from schema version ${version}`);
    current = { ...step.migrate(current), schemaVersion: version + 1 };
    version += 1;
    migrated = true;
  }
  return { doc: current, migrated };
}

/** state.json migrations. */
export const stateMigrations: readonly Migration[] = [
  // v2 (phase 03): the owner's account.
  { from: 1, migrate: (doc) => ({ ...doc, account: null }) },
  // v3 (phase 04): VPN settings.
  { from: 2, migrate: (doc) => ({ ...doc, vpn: null }) },
];

/** secrets.json migrations. */
export const secretsMigrations: readonly Migration[] = [
  // v2 (phase 03): the account password.
  { from: 1, migrate: (doc) => ({ ...doc, account: null }) },
  // v3 (phase 04): VPN secrets.
  { from: 2, migrate: (doc) => ({ ...doc, vpn: null }) },
];
