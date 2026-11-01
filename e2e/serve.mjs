// Starts the built dashboard with a fresh, temporary state dir, a fake VPN side and fake services
// (Sonarr, Prowlarr, qBittorrent, SABnzbd, Jellyfin, …) for e2e tests.
// Usage: node e2e/serve.mjs <port>   (run `pnpm build` first)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFakeServices } from './fake-services.mjs';
import { startFakeVpn } from './fake-vpn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'dashboard/server/dist/index.js');
const webDir = path.join(root, 'dashboard/web/dist');
if (!existsSync(entry) || !existsSync(path.join(webDir, 'index.html'))) {
  console.error('Build first: pnpm build');
  process.exit(1);
}

const tmp = mkdtempSync(path.join(process.env['TMPDIR'] ?? tmpdir(), 'easyarr-e2e-'));
const vpn = await startFakeVpn(path.join(tmp, 'vpn'));
const services = await startFakeServices({
  stateDir: path.join(tmp, 'state'),
  recyclarrDir: path.join(tmp, 'recyclarr'),
});
const child = spawn(process.execPath, [entry, 'serve'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: process.argv[2] ?? '3939',
    HOST: '127.0.0.1',
    EASYARR_WEB_DIR: webDir,
    EASYARR_STATE_DIR: path.join(tmp, 'state'),
    EASYARR_DATA_ROOT: tmp,
    EASYARR_LICENSES_DIR: root,
    LOG_LEVEL: 'warn',
    ...vpn.env,
    ...services.env,
  },
});
const stop = () => child.kill('SIGTERM');
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('exit', (code) => {
  vpn.stop();
  services.stop();
  rmSync(tmp, { recursive: true, force: true });
  process.exit(code ?? 0);
});
