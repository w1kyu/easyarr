// Playwright e2e for the setup wizard (SPEC §20).
//
//   pnpm build && pnpm test:e2e                      → local dashboards with fresh state + fakes
//   E2E_BASE_URL=http://localhost:39000 pnpm test:e2e → runs against the dev stack (dev/stack.sh up)
//
// Tests in a file share one server and run in order: they walk through the wizard like a user
// would. Locally, first-run.spec.ts runs three times — torrents only, Usenet only, both — each
// against its own fresh dashboard with fake services (fake-services.mjs) and a fake VPN.
import { defineConfig, devices } from '@playwright/test';

const external = process.env['E2E_BASE_URL'];
const port = 3939;
const FLOWS = ['torrents', 'usenet', 'both'] as const;
const flowPort = (i: number) => port + 1 + i;

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
  projects: [
    { name: 'wizard', testMatch: 'wizard.spec.ts', use: { ...devices['Desktop Chrome'] } },
    ...(external
      ? []
      : FLOWS.map((method, i) => ({
          name: `first-run-${method}`,
          testMatch: 'first-run.spec.ts',
          metadata: { method },
          use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${flowPort(i)}` },
        }))),
  ],
  ...(external
    ? {}
    : {
        webServer: [port, ...FLOWS.map((_, i) => flowPort(i))].map((p) => ({
          command: `node e2e/serve.mjs ${p}`,
          cwd: '..',
          url: `http://localhost:${p}/api/health`,
          reuseExistingServer: false,
          timeout: 30_000,
        })),
      }),
});
