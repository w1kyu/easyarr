import { expect, test, type Page } from '@playwright/test';

// One user walking through wizard steps 1–4 (prompts/03): every test continues where the previous
// one stopped, against a fresh install (new state dir locally, fresh dev stack in CI).
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
  await expect(page.getByText('Step 1 of 5')).toBeVisible();
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
  await expect(page.getByText('Step 4 of 5')).toBeVisible();
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
  await expect(page.getByText('Step 5 of 5')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Best for torrents' })).toBeVisible();
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

  // Change the settings: no reinstall, the VPN reconnects with the new password.
  await page.getByLabel('VPN password').fill(VPN_PASSWORD);
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(result).toHaveAttribute('data-ok', 'true', { timeout: 30_000 });
  await expect(result).toContainText('185.159.157.10 (Netherlands)');
  await expect(result).toContainText('Your home IP is hidden');
  await expect(result).toContainText('Port forwarding is on (port 51413)');

  const config = await page.request.get('/api/vpn/config');
  expect(await config.text()).not.toContain(VPN_PASSWORD);

  await next(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('First part of the setup is done')).toBeVisible();
});

test('step 5 (stack): skipping keeps the kill switch closed and finishes the wizard', async ({
  page,
}) => {
  test.skip(!external, 'local runs connect the fake VPN instead');
  await page.goto('/setup/vpn');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Skip/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('First part of the setup is done')).toBeVisible();
});

test('going back shows saved answers; a saved password is kept', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Review your answers' }).click();
  await expect(page).toHaveURL(/\/setup\/welcome$/);
  await page.goto('/setup/account');
  await expect(page.getByLabel('Username')).toHaveValue(USER);
  await expect(page.getByText(/A password is already saved/)).toBeVisible();
  await next(page);
  await expect(page).toHaveURL(/\/setup\/download$/);
  await expect(page.getByRole('radio', { name: 'Torrents' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/setup\/account$/);
});
