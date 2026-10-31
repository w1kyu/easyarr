import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SystemInfo } from '@easyarr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { verifyPassword } from '../auth/password.js';
import { createLogger } from '../logger.js';

const GIB = 1024 ** 3;
let dir: string;
let info: SystemInfo;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'easyarr-wizard-'));
  info = {
    arch: 'x64',
    totalMemoryBytes: 16 * GIB,
    disk: { freeBytes: 1e12, totalBytes: 2e12 },
    gpu: { kind: 'none', devices: [] },
  };
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const make = () =>
  buildApp({
    config: { version: 't', webDir: dir, licensesDir: dir, stateDir: dir, dataDir: dir },
    collectSystemInfo: async () => info,
  });

type App = Awaited<ReturnType<typeof make>>;
const post = (app: App, step: string, payload: unknown) =>
  app.inject({ method: 'POST', url: `/api/wizard/${step}`, payload: payload as object });
const readJson = async (f: string) => JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'));

const GOOD = { username: 'kevin', password: 'summer-rain7' };

async function finishThrough(app: App, step: 'system' | 'account' | 'download') {
  expect((await post(app, 'welcome', { started: true })).statusCode).toBe(200);
  expect((await post(app, 'system', { acknowledgedProblems: false })).statusCode).toBe(200);
  if (step === 'system') return;
  expect((await post(app, 'account', GOOD)).statusCode).toBe(200);
  if (step === 'account') return;
  expect((await post(app, 'download', { method: 'both' })).statusCode).toBe(200);
}

describe('GET /api/system-check', () => {
  it('returns facts plus verdicts', async () => {
    const app = await make();
    const res = await app.inject({ method: 'GET', url: '/api/system-check' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.info).toEqual(info);
    expect(body.overall).toBe('warning'); // no GPU
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(['arch', 'memory', 'disk', 'gpu']);
  });
});

describe('wizard API', () => {
  it('starts at welcome on a fresh install', async () => {
    const app = await make();
    const res = await app.inject({ method: 'GET', url: '/api/wizard' });
    expect(res.json()).toEqual({
      steps: [
        { id: 'welcome', completed: false },
        { id: 'system', completed: false },
        { id: 'account', completed: false },
        { id: 'download', completed: false },
        { id: 'vpn', completed: false },
      ],
      next: 'welcome',
      answers: {},
      account: null,
    });
  });

  it('saves each step, resumes at the next one, and survives a restart (refresh-safe)', async () => {
    let app = await make();
    await finishThrough(app, 'system');
    app = await make(); // new process, same state dir
    const view = (await app.inject({ method: 'GET', url: '/api/wizard' })).json();
    expect(view.next).toBe('account');
    expect(view.answers).toEqual({
      welcome: { started: true },
      system: { acknowledgedProblems: false },
    });
    const step = (await app.inject({ method: 'GET', url: '/api/wizard/system' })).json();
    expect(step).toEqual({ completed: true, answers: { acknowledgedProblems: false } });
  });

  it('refuses to skip ahead and unknown steps', async () => {
    const app = await make();
    const res = await post(app, 'account', GOOD);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'previous_steps_incomplete', issues: [] });
    expect((await post(app, 'teleport', {})).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/wizard/nope' })).statusCode).toBe(404);
  });

  it('validates bodies and answers with i18n keys', async () => {
    const app = await make();
    expect((await post(app, 'welcome', { started: false })).statusCode).toBe(400);
    await finishThrough(app, 'system');
    const res = await post(app, 'account', { username: 'k k', password: 'short' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: 'invalid',
      issues: [
        { path: 'username', message: 'wizard.error.usernameInvalid' },
        { path: 'password', message: 'wizard.error.passwordTooShort' },
      ],
    });
  });

  it('rejects non-JSON posts (no cross-site form posts)', async () => {
    const app = await make();
    const res = await app.inject({
      method: 'POST',
      url: '/api/wizard/welcome',
      headers: { 'content-type': 'text/plain' },
      payload: 'started=true',
    });
    expect(res.statusCode).toBe(415);
  });

  it('system step: a ❌ needs an explicit "continue anyway"', async () => {
    info.totalMemoryBytes = 2 * GIB;
    const app = await make();
    await post(app, 'welcome', { started: true });
    const res = await post(app, 'system', { acknowledgedProblems: false });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual([
      { path: 'acknowledgedProblems', message: 'wizard.error.acknowledgeRequired' },
    ]);
    expect((await post(app, 'system', { acknowledgedProblems: true })).statusCode).toBe(200);
  });

  describe('account step', () => {
    it('stores the username + a hash in state.json and the plaintext only in secrets.json', async () => {
      const app = await make();
      await finishThrough(app, 'account');
      const state = await readJson('state.json');
      expect(state.account.username).toBe('kevin');
      expect(await verifyPassword(GOOD.password, state.account.passwordHash)).toBe(true);
      expect(JSON.stringify(state)).not.toContain(GOOD.password);
      expect(state.wizard.answers.account).toEqual({ username: 'kevin' });
      const secrets = await readJson('secrets.json');
      expect(secrets.account).toEqual({ password: GOOD.password });
      expect((await fs.stat(path.join(dir, 'secrets.json'))).mode & 0o777).toBe(0o600);
    });

    it('never returns the password or hash', async () => {
      const app = await make();
      await finishThrough(app, 'account');
      for (const url of ['/api/wizard', '/api/wizard/account']) {
        const body = (await app.inject({ method: 'GET', url })).body;
        expect(body).not.toContain(GOOD.password);
        expect(body).not.toContain('scrypt');
      }
      const step = (await app.inject({ method: 'GET', url: '/api/wizard/account' })).json();
      expect(step.account).toEqual({ username: 'kevin', hasPassword: true });
    });

    it('requires a password the first time, keeps the old one when left out later', async () => {
      const app = await make();
      await finishThrough(app, 'system');
      const first = await post(app, 'account', { username: 'kevin' });
      expect(first.statusCode).toBe(400);
      expect(first.json().issues).toEqual([
        { path: 'password', message: 'wizard.error.passwordRequired' },
      ]);
      await post(app, 'account', GOOD);
      const hash = (await readJson('state.json')).account.passwordHash;
      expect((await post(app, 'account', { username: 'kev' })).statusCode).toBe(200);
      const state = await readJson('state.json');
      expect(state.account).toMatchObject({ username: 'kev', passwordHash: hash });
      expect((await readJson('secrets.json')).account.password).toBe(GOOD.password);
    });

    it('redacts the new password from logs right away', async () => {
      const lines: string[] = [];
      const logger = createLogger('info', { write: (l: string) => void lines.push(l) });
      const app = await buildApp({
        config: { version: 't', webDir: dir, licensesDir: dir, stateDir: dir, dataDir: dir },
        logger,
        collectSystemInfo: async () => info,
      });
      await finishThrough(app, 'account');
      logger.info(`oops ${GOOD.password}`);
      expect(lines.join('')).not.toContain(GOOD.password);
    });
  });

  it('after step 4 the VPN step is next; it can be skipped, but "configured" needs a passed test', async () => {
    const app = await make();
    await finishThrough(app, 'download');
    let view = (await app.inject({ method: 'GET', url: '/api/wizard' })).json();
    expect(view.next).toBe('vpn');
    const untested = await post(app, 'vpn', { mode: 'configured' });
    expect(untested.statusCode).toBe(400);
    expect(untested.json().issues).toEqual([
      { path: 'mode', message: 'wizard.error.vpnNotTested' },
    ]);
    expect((await post(app, 'vpn', { mode: 'skipped' })).statusCode).toBe(200);
    view = (await app.inject({ method: 'GET', url: '/api/wizard' })).json();
    expect(view.next).toBeNull();
    expect(view.answers.download).toEqual({ method: 'both' });
    expect((await post(app, 'download', { method: 'fax' })).statusCode).toBe(400);
  });

  it('handles parallel saves without losing answers', async () => {
    const app = await make();
    await finishThrough(app, 'account');
    await Promise.all([
      post(app, 'download', { method: 'usenet' }),
      post(app, 'system', { acknowledgedProblems: true }),
      post(app, 'welcome', { started: true }),
    ]);
    const state = await readJson('state.json');
    expect(Object.keys(state.wizard.answers).sort()).toEqual([
      'account',
      'download',
      'system',
      'welcome',
    ]);
  });
});
