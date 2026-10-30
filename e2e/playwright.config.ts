// Playwright e2e for the setup wizard (SPEC §20).
//
//   pnpm build && pnpm test:e2e                      → starts a local dashboard with fresh state
//   E2E_BASE_URL=http://localhost:39000 pnpm test:e2e → runs against the dev stack (dev/stack.sh up)
//
// Tests share one server and run in order: they walk through the wizard like a user would.
import { defineConfig, devices } from '@playwright/test';

const external = process.env['E2E_BASE_URL'];
const port = 3939;

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  // No retries: tests build on each other and the server keeps its state, so a retry can't pass.
  retries: 0,
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: external ?? `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(external
    ? {}
    : {
        webServer: {
          command: `node e2e/serve.mjs ${port}`,
          cwd: '..',
          url: `http://localhost:${port}/api/health`,
          reuseExistingServer: false,
          timeout: 30_000,
        },
      }),
});
