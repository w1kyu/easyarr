import { expect, test, type Page } from '@playwright/test';

// One user walking through wizard steps 1–4 (prompts/03): every test continues where the previous
// one stopped, against a fresh install (new state dir locally, fresh dev stack in CI).
test.describe.configure({ mode: 'serial' });

const USER = 'e2e-owner';
const PASSWORD = 'purple-train-river-7';

async function next(page: Page) {
  await page.getByRole('button', { name: /^Next/ }).click();
}

test('opening EasyArr on a fresh install starts the wizard at Welcome', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup\/welcome$/);
  await expect(page.getByRole('heading', { name: 'Welcome to EasyArr' })).toBeVisible();
  await expect(page.getByText('Step 1 of 4')).toBeVisible();
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

test('step 4: choose a download method and finish', async ({ page }) => {
  await page.goto('/setup/download');
  await expect(page.getByText('Step 4 of 4')).toBeVisible();
  await next(page);
  await expect(page.getByText('Please choose one of the options.')).toBeVisible();
  await page.getByRole('button', { name: 'Usenet explained' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Usenet 101' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: 'Torrents' }).click();
  await next(page);
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
