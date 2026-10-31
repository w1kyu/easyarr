import type { FastifyInstance } from 'fastify';
import { useApiErrorHandler } from '../http-errors.js';
import type { PortSync } from './port-sync.js';
import type { VpnService } from './service.js';

export interface VpnRoutesOptions {
  vpn: VpnService;
  portSync: PortSync;
}

/** /api/vpn/* (SPEC §7.3). Saving settings applies them right away (the wrapper reloads Gluetun). */
export async function vpnRoutes(app: FastifyInstance, { vpn, portSync }: VpnRoutesOptions) {
  useApiErrorHandler(app);

  app.get('/api/vpn/config', async () => ({ config: await vpn.configView() }));
  app.post('/api/vpn/config', async (request) => ({ config: await vpn.save(request.body) }));
  app.get('/api/vpn/status', async () => vpn.status());
  app.post('/api/vpn/test', async () => {
    const result = await vpn.test();
    // A new forwarded port can be applied right away instead of on the next timer tick.
    if (result.ok) void portSync.runOnce();
    return result;
  });
  app.post('/api/vpn/reconnect', async () => {
    await vpn.reconnect();
    return { ok: true };
  });
}
