import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['dashboard/*/vitest.config.ts'],
  },
});
