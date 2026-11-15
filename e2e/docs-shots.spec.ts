import { expect, test, type Page } from '@playwright/test';

// Screenshots for the user guides (docs/images/, D-080). Not a test: run on purpose with
//   pnpm build && pnpm docs:shots
// It walks a torrents-only first run against the fake services and a fake VPN (no real accounts,
// keys or addresses appear), then saves JPEGs at 1280×800. Re-run after UI changes.
test.describe.configure({ mode: 'serial' });
test.skip(!process.env['DOCS_SHOTS'], 'set DOCS_SHOTS=1 (pnpm docs:shots)');
test.use({ viewport: { width: 1280, height: 800 } });

const PROWLARR_KEY = 'p'.repeat(32);
const DIR = 'docs/images';

async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
  // Let animations and lazy images settle.
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78, ...opts });
}
const next = (page: Page) => page.getByRole('button', { name: /^Next/ }).click();

test('setup wizard', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Start setup/ })).toBeVisible();
  await shot(page, 'setup-welcome');
  await page.getByRole('button', { name: /Start setup/ }).click();

  await expect(page.getByTestId('system-arch')).toHaveAttribute('data-verdict', /ok|warning|error/);
  await shot(page, 'setup-system');
  const acknowledge = page.getByRole('checkbox');
  if (await acknowledge.isVisible()) await acknowledge.check();
  await next(page);

  await page.getByLabel('Username').fill('alex');
  await page.getByLabel('Password', { exact: true }).fill('purple-train-river-7');
  await page.getByLabel('Repeat password').fill('purple-train-river-7');
  await next(page);

  await page.getByRole('radio', { name: 'Torrents', exact: true }).click();
  await next(page);

  await page.getByLabel('Search VPN providers').fill('private internet');
  await page.getByTestId('vpn-provider-pia').click();
  await shot(page, 'setup-vpn');
  await page.getByLabel('VPN username').fill('p1234567');
  await page.getByLabel('VPN password').fill('correct-horse-vpn-9');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByTestId('vpn-result')).toHaveAttribute('data-ok', 'true', {
    timeout: 30_000,
  });
  await page.getByTestId('vpn-result').scrollIntoViewIfNeeded();
  await shot(page, 'setup-vpn-connected');
  await next(page);

  await expect(page).toHaveURL(/\/setup\/indexers$/);
  await shot(page, 'setup-indexers');
  const added = await page.request.post('/apps/prowlarr/api/v1/indexer', {
    headers: { 'x-api-key': PROWLARR_KEY },
    data: {
      name: 'Some public tracker',
      implementation: 'Cardigann',
      protocol: 'torrent',
      redirect: true,
      // The fake Prowlarr accepts this key (fake-world.ts).
      fields: [{ name: 'apiKey', value: 'indexer-key-0123456789' }],
    },
  });
  expect(added.status()).toBe(201);
  await page.getByRole('button', { name: /Check again/ }).click();
  await expect(page.getByTestId('indexers-status')).toContainText('Prowlarr has 1 search site');
  await next(page);

  await expect(page).toHaveURL(/\/setup\/library$/);
  await shot(page, 'setup-library');
  await next(page);

  await page.getByRole('button', { name: /^Connect everything/ }).click();
  await expect(page.getByTestId('wiring-checklist')).toBeVisible();
  await expect(page.getByTestId('finish-tour')).toBeVisible({ timeout: 90_000 });
  await shot(page, 'setup-finish');
  await page.getByRole('button', { name: /Go to my dashboard/ }).click();
  await expect(page.getByTestId('tile-watch')).toBeVisible();
});

test('dashboard, settings and help', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('downloads')).toContainText('Big.Buck.Bunny');
  await expect(page.getByTestId('recent')).toContainText('Tears of Steel');
  await shot(page, 'home');

  await page.goto('/settings/backups');
  await shot(page, 'settings-backups');

  await page.goto('/help');
  await page
    .getByRole('button', { name: /Get help with AI/ })
    .first()
    .click();
  await expect(page.getByTestId('ai-help-preview')).toBeVisible();
  await page.getByLabel('What I was trying to do').fill('Download a movie');
  await shot(page, 'ai-help');
});
