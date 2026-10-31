import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { JsonStore } from './json-store.js';
import { migrate } from './migrations.js';
import { secretsStore, stateStore } from './index.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'easyarr-state-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('state store', () => {
  it('creates state.json and secrets.json with mode 600', async () => {
    const s = await stateStore(dir).load();
    expect(s.created).toBe(true);
    expect(s.value.schemaVersion).toBe(3);
    await secretsStore(dir).load();
    for (const f of ['state.json', 'secrets.json']) {
      const st = await fs.stat(path.join(dir, f));
      expect(st.mode & 0o777).toBe(0o600);
    }
  });

  it('round-trips and does not recreate on second load', async () => {
    const store = stateStore(dir);
    const { value } = await store.load();
    await store.save({ ...value, ui: { mode: 'advanced' } });
    const again = await store.load();
    expect(again.created).toBe(false);
    expect(again.value.ui.mode).toBe('advanced');
  });

  it('writes atomically (no temp files left behind)', async () => {
    const store = stateStore(dir);
    await store.load();
    for (let i = 0; i < 5; i++) await store.save((await store.load()).value);
    expect((await fs.readdir(dir)).sort()).toEqual(['state.json']);
  });

  it('refuses to overwrite a corrupt file', async () => {
    await fs.writeFile(path.join(dir, 'state.json'), '{not json');
    await expect(stateStore(dir).load()).rejects.toThrow(/not valid JSON/);
    expect(await fs.readFile(path.join(dir, 'state.json'), 'utf8')).toBe('{not json');
  });

  it('refuses files from a newer EasyArr', async () => {
    await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify({ schemaVersion: 99 }));
    await expect(stateStore(dir).load()).rejects.toThrow(/newer EasyArr/);
  });
});

describe('real migrations', () => {
  it('v1 → v3 adds an empty account + VPN to state.json and secrets.json, keeping everything else', async () => {
    const v1State = {
      schemaVersion: 1,
      createdAt: '2026-10-30T00:00:00.000Z',
      wizard: { completedSteps: ['welcome'], answers: { welcome: { started: true } } },
      ui: { mode: 'advanced' },
    };
    const v1Secrets = { schemaVersion: 1, apiKeys: { sonarr: 'a'.repeat(32) } };
    await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify(v1State));
    await fs.writeFile(path.join(dir, 'secrets.json'), JSON.stringify(v1Secrets));

    const state = await stateStore(dir).load();
    expect(state.migrated).toBe(true);
    expect(state.value).toEqual({ ...v1State, schemaVersion: 3, account: null, vpn: null });
    const secrets = await secretsStore(dir).load();
    expect(secrets.value).toEqual({ ...v1Secrets, schemaVersion: 3, account: null, vpn: null });
    // Persisted: a second load doesn't migrate again.
    expect((await stateStore(dir).load()).migrated).toBe(false);
    expect((await secretsStore(dir).load()).migrated).toBe(false);
  });
});

describe('migrations', () => {
  const schema = z.object({
    schemaVersion: z.literal(3),
    name: z.string(),
    tags: z.array(z.string()),
  });
  const migrations = [
    {
      from: 1,
      migrate: (d: Record<string, unknown>) => ({ ...d, name: String(d['title'] ?? '') }),
    },
    { from: 2, migrate: (d: Record<string, unknown>) => ({ ...d, tags: [] }) },
  ];

  it('runs every step in order and bumps schemaVersion', () => {
    const { doc, migrated } = migrate({ schemaVersion: 1, title: 'x' }, 3, migrations);
    expect(migrated).toBe(true);
    expect(doc).toMatchObject({ schemaVersion: 3, name: 'x', tags: [] });
  });

  it('migrates on load and persists the result', async () => {
    const file = path.join(dir, 'doc.json');
    await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, title: 'hello' }));
    const store = new JsonStore({
      file,
      schema,
      version: 3,
      migrations,
      defaults: () => ({ schemaVersion: 3 as const, name: '', tags: [] }),
    });
    const loaded = await store.load();
    expect(loaded.migrated).toBe(true);
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toMatchObject({
      schemaVersion: 3,
      name: 'hello',
    });
  });

  it('fails clearly when a step is missing', () => {
    expect(() => migrate({ schemaVersion: 0 }, 2, migrations)).toThrow(
      /No migration from schema version 0/,
    );
  });
});
