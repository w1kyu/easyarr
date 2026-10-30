import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Test against shared sources directly, no prior build needed.
    alias: {
      '@easyarr/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'server',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
