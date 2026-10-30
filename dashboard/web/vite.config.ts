import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { APP_NAME } from '../shared/src/brand.ts';
import { defineConfig, type Plugin } from 'vite';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** The app name lives in brand.ts only (CLAUDE.md) — inject it into index.html. */
const brandHtml = (): Plugin => ({
  name: 'easyarr-brand-html',
  transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', APP_NAME),
});

export default defineConfig({
  plugins: [react(), tailwindcss(), brandHtml()],
  resolve: {
    // `@/` = vendored umbrelOS code (keeps its upstream imports unchanged), `~/` = our own code.
    alias: { '@/': src('./src/vendor/umbrel/'), '~/': src('./src/') },
    conditions: ['@easyarr/source'],
  },
  build: { outDir: 'dist', sourcemap: true },
  server: {
    port: 5173,
    // In-app help reads the repo's docs/ folder (two levels up).
    fs: { allow: [src('../..')] },
    proxy: { '/api': 'http://localhost:3000', '/licenses': 'http://localhost:3000' },
  },
});
