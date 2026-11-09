import { expect, test, type Page } from '@playwright/test';

// One user walking through the whole wizard (torrents): every test continues where the previous
// one stopped, against a fresh install (new state dir + fakes locally, fresh dev stack in CI).
// Locally the services are fakes; on the stack the Finish step wires the real services (CI has no
// VPN, so the TRaSH guide download fails there — the test checks how that failure is shown).
test.describe.configure({ mode: 'serial' });

const USER = 'e2e-owner';
const PASSWORD = 'purple-train-river-7';
const VPN_PASSWORD = 'correct-horse-vpn-9';
const external = !!process.env['E2E_BASE_URL'];

async function next(page: Page) {
  await page.getByRole('button', { name: /^Next/ }).click();
}

test('opening EasyArr on a fresh install starts the wizard at Welcome', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup\/welcome$/);
  await expect(page.getByRole('heading', { name: 'Welcome to EasyArr' })).toBeVisible();
  await expect(page.getByText('Step 1 of 7')).toBeVisible();
  await expect(page.getByText('Please use it responsibly')).toBeVisible();
  await expect(page.getByRole('button', { name: /Restore from backup/ })).toBeDisabled();
});

test('"How does it work?" opens the in-app help, and links inside it work', async ({ page }) => {
  await page.goto('/setup/welcome');
  await page.getByRole('button', { name: 'How does it work?' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'How EasyArr works' })).toBeVisible();
  await dialog.getByRole('link', { name: 'Usenet', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Usenet 101' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('step 1 → 2: system check shows a verdict for every item', async ({ page }) => {
  await page.goto('/setup/welcome');
  await page.getByRole('button', { name: /Start setup/ }).click();
  await expect(page).toHaveURL(/\/setup\/system$/);
  for (const id of ['arch', 'memory', 'disk', 'gpu']) {
    await expect(page.getByTestId(`system-${id}`)).toHaveAttribute(
      'data-verdict',
      /^(ok|warning|error)$/,
    );
  }
  await expect(page.getByTestId('system-arch')).toContainText(/amd64|arm64/);
  // Small CI machines may get a ❌ — then the user must explicitly continue.
  const acknowledge = page.getByRole('checkbox');
  if (await acknowledge.isVisible()) await acknowledge.check();
  await next(page);
  await expect(page).toHaveURL(/\/setup\/account$/);
});

test('refreshing mid-way keeps progress; skipping ahead is not possible', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup\/account$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await page.goto('/setup/download');
  await expect(page).toHaveURL(/\/setup\/account$/);
});

test('step 3: account form validates, then saves', async ({ page }) => {
  await page.goto('/setup/account');
  await page.getByLabel('Username').fill('no spaces');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await expect(page.getByTestId('password-strength')).toHaveAttribute('data-score', '1');
  await next(page);
  await expect(page.getByText(/Use 2–32 letters/)).toBeVisible();
  await expect(page.getByText(/too easy to guess/)).toBeVisible();

  await page.getByLabel('Username').fill(USER);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repeat password').fill(`${PASSWORD}x`);
  await next(page);
  await expect(page.getByText("The passwords don't match.")).toBeVisible();

  await page.getByLabel('Repeat password').fill(PASSWORD);
  await next(page);
  await expect(page).toHaveURL(/\/setup\/download$/);
});

test('the API never returns the password', async ({ request }) => {
  for (const url of ['/api/wizard', '/api/wizard/account']) {
    const body = await (await request.get(url)).text();
    expect(body).toContain(USER);
    expect(body).not.toContain(PASSWORD);
  }
});

test('step 4: choose a download method', async ({ page }) => {
  await page.goto('/setup/download');
  await expect(page.getByText('Step 4 of 7')).toBeVisible();
  await next(page);
  await expect(page.getByText('Please choose one of the options.')).toBeVisible();
  await page.getByRole('button', { name: 'Usenet explained' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Usenet 101' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: 'Torrents' }).click();
  await next(page);
  await expect(page).toHaveURL(/\/setup\/vpn$/);
});

test('step 5: "Skip for now" explains honestly that downloads stay off', async ({ page }) => {
  await page.goto('/setup/vpn');
  await expect(page.getByText('Step 5 of 8')).toBeVisible();
  // On the stack the leak test has already saved a VPN, so step 5 opens that provider first.
  const list = page.getByRole('heading', { name: 'Best for torrents' });
  const other = page.getByRole('button', { name: 'Other provider' });
  await expect(list.or(other)).toBeVisible();
  if (await other.isVisible()) await other.click();
  await expect(list).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/EasyArr never downloads without a VPN/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Set up a VPN now' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/setup\/vpn$/);
});

// The connect flow needs the fake VPN side from serve.mjs; the stack has no real VPN account.
test('step 5: a wrong password gets a plain reason; fixing it connects and hides the home IP', async ({
  page,
}) => {
  test.skip(external, 'needs the fake VPN (local run)');
  await page.goto('/setup/vpn');
  await page.getByLabel('Search VPN providers').fill('private internet');
  await page.getByTestId('vpn-provider-pia').click();
  await expect(page.getByTestId('vpn-guide')).toContainText('Private Internet Access');
  await page.getByLabel('VPN username').fill('p1234567');
  await page.getByLabel('VPN password').fill('wrong-password');
  await page.getByRole('button', { name: 'Connect' }).click();
  const result = page.getByTestId('vpn-result');
  await expect(result).toHaveAttribute('data-ok', 'false', { timeout: 30_000 });
  await expect(result).toContainText('Username or password was refused');
  await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();

  // Change the settings: no reinstall, the VPN reconnects with the new password. (A person takes
  // more than a second to retype; the wrapper's status.json has 1-second timestamps, and a status
  // from the same second as the new save can't be told apart from the old settings' crash.)
  await page.waitForTimeout(2_000);
  await page.getByLabel('VPN password').fill(VPN_PASSWORD);
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(result).toHaveAttribute('data-ok', 'true', { timeout: 30_000 });
  await expect(result).toContainText('185.159.157.10 (Netherlands)');
  await expect(result).toContainText('Your home IP is hidden');
  await expect(result).toContainText('Port forwarding is on (port 51413)');

  const config = await page.request.get('/api/vpn/config');
  expect(await config.text()).not.toContain(VPN_PASSWORD);

  await next(page);
  await expect(page).toHaveURL(/\/setup\/indexers$/);
});

test('step 5 (stack): skipping keeps the kill switch closed and goes on', async ({ page }) => {
  test.skip(!external, 'local runs connect the fake VPN instead');
  await page.goto('/setup/vpn');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Skip/ }).click();
  await expect(page).toHaveURL(/\/setup\/indexers$/);
});

test('step 7: no search sites yet → "Do this later" explains what that means', async ({ page }) => {
  await page.goto('/setup/indexers');
  await expect(page.getByText('Step 6 of 8')).toBeVisible();
  await expect(page.getByTestId('indexers-guide')).toContainText('Add Indexer');
  await expect(page.getByTestId('indexers-status')).toBeVisible();
  await page.getByRole('button', { name: /Do this later/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/can't find anything to download/)).toBeVisible();
  await dialog.getByRole('button', { name: /Continue/ }).click();
  await expect(page).toHaveURL(/\/setup\/library$/);
});

test('step 8: defaults are all libraries, English, Balanced', async ({ page }) => {
  await page.goto('/setup/library');
  for (const name of ['Movies', 'TV shows', 'Music']) {
    await expect(page.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'true');
  }
  await expect(page.getByRole('radio', { name: /Balanced/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await next(page);
  await expect(page).toHaveURL(/\/setup\/finish$/);
});

test('step 9: Finish connects the apps with a live checklist', async ({ page }) => {
  // The real stack waits for every service and for the TRaSH guide download to fail (no VPN).
  test.setTimeout(15 * 60_000);
  await page.goto('/setup/finish');
  await page.getByRole('button', { name: /^Connect everything/ }).click();
  await expect(page.getByTestId('wiring-checklist')).toBeVisible();
  const tour = page.getByTestId('finish-tour');
  const failed = page.getByTestId('finish-failed');
  await expect(tour.or(failed)).toBeVisible({ timeout: 14 * 60_000 });
  if (external) {
    // CI has no working VPN: only the quality profiles (TRaSH guides, over the internet) fail,
    // and the checklist says why in plain words.
    await expect(failed).toBeVisible();
    await expect(page.getByTestId('wiring-step-recyclarr.sync')).toHaveAttribute(
      'data-state',
      'failed',
    );
    await expect(page.getByText(/TRaSH guides/)).toBeVisible();
    for (const step of ['sonarr.connect', 'radarr.connect', 'prowlarr.apps', 'jellyfin.setup']) {
      await expect(page.getByTestId(`wiring-step-${step}`)).toHaveAttribute('data-state', 'done');
    }
    await page.getByRole('button', { name: 'Finish anyway' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Finish anyway' }).click();
    await expect(page).toHaveURL(/\/$/);
    // The dashboard's warnings banner offers the repair.
    await expect(page.locator('[data-warning="wiringProblems"]')).toBeVisible();
  } else {
    await expect(tour).toContainText('Add at least one search site');
    await page.getByRole('button', { name: /Go to my dashboard/ }).click();
    await expect(page).toHaveURL(/\/$/);
  }
  await expect(page.getByTestId('tile-watch')).toBeVisible();
});

test('going back shows saved answers; a saved password is kept', async ({ page }) => {
  await page.goto('/setup/account');
  await expect(page.getByLabel('Username')).toHaveValue(USER);
  // The saved password is never sent back to the browser (D-064).
  await expect(page.getByText(/isn't shown here for security reasons/)).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await next(page);
  await expect(page).toHaveURL(/\/setup\/download$/);
  await expect(page.getByRole('radio', { name: 'Torrents' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/setup\/account$/);
});
