import { expect, test, type Page } from '@playwright/test';

// A complete first run like a beginner would do it (prompts/06): every wizard step, then the
// Finish step wires the (fake) services. Runs once per download method — see playwright.config.ts.
// Local only: the services are the fakes from e2e/fake-services.mjs, the VPN is e2e/fake-vpn.mjs.
test.describe.configure({ mode: 'serial' });
test.skip(!!process.env['E2E_BASE_URL'], 'needs the fake services (local run)');

// Secrets the fakes accept (dashboard/server/src/wiring/testing/fake-world.ts).
const FAKE_USENET_HOST = 'news.example.com';
const FAKE_USENET_PASSWORD = 'usenet-password-1';
const FAKE_INDEXER_KEY = 'indexer-key-0123456789';
const PROWLARR_KEY = 'p'.repeat(32);

type Method = 'torrents' | 'usenet' | 'both';
const methodOf = (info: { project: { metadata: Record<string, unknown> } }) =>
  info.project.metadata['method'] as Method;

const next = (page: Page) => page.getByRole('button', { name: /^Next/ }).click();

test('steps 1–5: welcome, system check, account, download method, VPN', async ({ page }, info) => {
  const method = methodOf(info);
  await page.goto('/');
  await page.getByRole('button', { name: /Start setup/ }).click();
  await expect(page.getByTestId('system-arch')).toHaveAttribute('data-verdict', /ok|warning|error/);
  const acknowledge = page.getByRole('checkbox');
  if (await acknowledge.isVisible()) await acknowledge.check();
  await next(page);

  await page.getByLabel('Username').fill('beginner');
  await page.getByLabel('Password', { exact: true }).fill('purple-train-river-7');
  await page.getByLabel('Repeat password').fill('purple-train-river-7');
  await next(page);

  const label = { torrents: 'Torrents', usenet: 'Usenet', both: 'Both' }[method];
  await page.getByRole('radio', { name: label, exact: true }).click();
  await next(page);

  await expect(page).toHaveURL(/\/setup\/vpn$/);
  await page.getByLabel('Search VPN providers').fill('private internet');
  await page.getByTestId('vpn-provider-pia').click();
  await page.getByLabel('VPN username').fill('p1234567');
  await page.getByLabel('VPN password').fill('correct-horse-vpn-9');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByTestId('vpn-result')).toHaveAttribute('data-ok', 'true', {
    timeout: 30_000,
  });
  await next(page);
});

test('step 6 (Usenet): provider and indexer, both tested', async ({ page }, info) => {
  test.skip(methodOf(info) === 'torrents', 'no Usenet');
  await page.goto('/setup/usenet');
  const total = methodOf(info) === 'both' ? 9 : 8;
  await expect(page.getByText(`Step 6 of ${total}`)).toBeVisible();
  await expect(page.getByTestId('usenet-explainer')).toContainText('Indexer');

  const server = page.getByTestId('usenet-server-0');
  await server.getByLabel('Server address').fill(FAKE_USENET_HOST);
  await server.getByLabel('Username').fill('me@example.com');
  await server.getByLabel('Password', { exact: true }).fill('typo');
  await server.getByRole('button', { name: 'Test this provider' }).click();
  await expect(server.getByTestId('usenet-test-result')).toContainText('was refused');
  await server.getByLabel('Password', { exact: true }).fill(FAKE_USENET_PASSWORD);
  await server.getByRole('button', { name: 'Test this provider' }).click();
  await expect(server.getByTestId('usenet-test-result')).toHaveAttribute('data-ok', 'true');

  const indexer = page.getByTestId('usenet-indexer-0');
  await indexer.getByLabel('Indexer', { exact: true }).selectOption({ label: 'NZBgeek' });
  await expect(indexer.getByLabel('Address')).toHaveValue('https://api.nzbgeek.info');
  await indexer.getByLabel('API key').fill(FAKE_INDEXER_KEY);
  await indexer.getByRole('button', { name: 'Test this indexer' }).click();
  await expect(indexer.getByTestId('usenet-test-result')).toHaveAttribute('data-ok', 'true');
  await next(page);
  await expect(page).toHaveURL(
    methodOf(info) === 'both' ? /\/setup\/indexers$/ : /\/setup\/library$/,
  );

  // Secrets are never sent back.
  const body = await (await page.request.get('/api/wizard')).text();
  expect(body).toContain(FAKE_USENET_HOST);
  expect(body).not.toContain(FAKE_USENET_PASSWORD);
  expect(body).not.toContain(FAKE_INDEXER_KEY);
});

test('step 7 (torrents): add a search site in Prowlarr, EasyArr notices it', async ({
  page,
}, info) => {
  test.skip(methodOf(info) === 'usenet', 'no torrents');
  await page.goto('/setup/indexers');
  await expect(page.getByText('No search sites in Prowlarr yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Do this later/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open Prowlarr/ })).toHaveAttribute(
    'href',
    '/apps/prowlarr/',
  );
  // What the user does in the Prowlarr tab, through EasyArr's proxy like the browser would.
  const added = await page.request.post('/apps/prowlarr/api/v1/indexer', {
    headers: { 'x-api-key': PROWLARR_KEY },
    data: {
      name: 'Some public tracker',
      implementation: 'Cardigann',
      protocol: 'torrent',
      redirect: true,
      fields: [{ name: 'apiKey', value: FAKE_INDEXER_KEY }],
    },
  });
  expect(added.status()).toBe(201);
  await page.getByRole('button', { name: /Check again/ }).click();
  await expect(page.getByTestId('indexers-status')).toContainText('Prowlarr has 1 search site');
  await next(page);
  await expect(page).toHaveURL(/\/setup\/library$/);
});

test('step 8: what to collect, language, quality', async ({ page }, info) => {
  await page.goto('/setup/library');
  if (methodOf(info) === 'torrents') {
    await page.getByRole('switch', { name: 'Music' }).click();
  }
  await page.getByLabel('Language', { exact: true }).selectOption('de');
  await page.getByRole('radio', { name: 'Best quality' }).click();
  await next(page);
  await expect(page).toHaveURL(/\/setup\/finish$/);
});

test('step 9: everything gets connected, then the "what now" tour and the dashboard', async ({
  page,
}, info) => {
  const method = methodOf(info);
  await page.goto('/setup/finish');
  await expect(page.getByTestId('finish-summary')).toBeVisible();
  await page.getByRole('button', { name: /^Connect everything/ }).click();
  await expect(page.getByTestId('wiring-checklist')).toBeVisible();
  await expect(page.getByTestId('finish-tour')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('link', { name: /Open the request page/ })).toBeVisible();
  await page.getByRole('button', { name: /Go to my dashboard/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('tile-watch')).toBeVisible();

  // What got wired matches the answers.
  const { ledger, lastRun } = (await (await page.request.get('/api/wiring')).json()) as {
    ledger: { key: string }[];
    lastRun: { ok: boolean };
  };
  const keys = ledger.map((e) => e.key);
  expect(lastRun.ok).toBe(true);
  expect(keys).toContain('jellyfin.library.movies');
  expect(keys).toContain('prowlarr.application.radarr');
  const torrents = method !== 'usenet';
  const usenet = method !== 'torrents';
  expect(keys.includes('radarr.downloadclient.qbittorrent')).toBe(torrents);
  expect(keys.includes('radarr.downloadclient.sabnzbd')).toBe(usenet);
  expect(keys.some((k) => k.startsWith('sabnzbd.server.'))).toBe(usenet);
  expect(keys.some((k) => k.startsWith('prowlarr.indexer.'))).toBe(usenet);
  // Music was switched off for the torrents-only run.
  expect(keys.includes('lidarr.rootfolder')).toBe(method !== 'torrents');
});

test('a second Finish changes nothing (idempotent), the wizard stays complete', async ({
  page,
}) => {
  // Changing an answer re-opens Finish; running it again must not add duplicates.
  await page.goto('/setup/library');
  await page.getByRole('radio', { name: 'Best quality' }).click();
  await next(page);
  await page.getByRole('button', { name: /^Connect everything/ }).click();
  await expect(page.getByTestId('finish-tour')).toBeVisible({ timeout: 90_000 });
  const status = (await (await page.request.get('/api/wiring')).json()) as {
    lastRun: { ok: boolean; changes: number };
  };
  expect(status.lastRun).toMatchObject({ ok: true, changes: 0 });
  await page.getByRole('button', { name: /Go to my dashboard/ }).click();
  await expect(page.getByTestId('tile-watch')).toBeVisible();
});

test('dashboard: downloads, recently added, Simple/Advanced remembered', async ({ page }, info) => {
  const method = methodOf(info);
  const shots = process.env['E2E_SHOTS'];
  await page.goto('/');
  await expect(page.getByTestId('tile-request')).toHaveAttribute('href', /:39055$/);
  await expect(page.getByTestId('status-strip')).toContainText('Protected');
  const downloads = page.getByTestId('downloads');
  // The fakes have one torrent and one Usenet job; each shows only if that client is in use…
  // …but both clients always answer, so both are listed (the dashboard shows what's there).
  await expect(downloads).toContainText('Big.Buck.Bunny.2008.1080p.BluRay');
  await expect(downloads).toContainText('Sintel.S01E01.720p');
  await expect(page.getByTestId('recent')).toContainText('Tears of Steel');
  await expect(page.getByTestId('warnings')).toHaveCount(0);
  await expect(page.getByTestId('services')).toHaveCount(0);
  if (shots) await page.screenshot({ path: `${shots}/simple-${method}.png`, fullPage: true });

  await page.getByRole('button', { name: 'Advanced' }).click();
  const services = page.getByTestId('services');
  await expect(services).toBeVisible();
  await expect(services.locator('[data-service="sonarr"]')).toContainText('Running');
  await expect(services.locator('[data-service="sonarr"] a')).toHaveAttribute(
    'href',
    '/apps/sonarr/',
  );
  await expect(page.getByTestId('vpn-details')).toContainText('Public IP');
  await page.getByLabel('Show the log of').selectOption('sonarr');
  await expect(page.getByTestId('logs')).toContainText(/log is empty|isn't answering/);

  // Remembered on the server: a reload (or another device) opens in Advanced.
  await page.reload();
  await expect(page.getByTestId('services')).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/advanced-${method}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Simple' }).click();
  await page.reload();
  await expect(page.getByTestId('tile-watch')).toBeVisible();
  await expect(page.getByTestId('services')).toHaveCount(0);
});
