import { existsSync } from 'node:fs';
import path from 'node:path';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import { APP_NAME } from '@easyarr/shared';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { SystemInfo } from '@easyarr/shared';
import type { ServeConfig } from './config.js';
import { secretsStore } from './state/index.js';
import { Mutex } from './state/mutex.js';
import { collectSystemInfo } from './system/check.js';
import { VpnFiles } from './vpn/files.js';
import { GluetunClient } from './vpn/gluetun.js';
import { PortSync, QbittorrentClient } from './vpn/port-sync.js';
import { vpnRoutes } from './vpn/routes.js';
import { VpnService } from './vpn/service.js';
import { wizardRoutes } from './wizard/routes.js';

export type AppConfig = Pick<
  ServeConfig,
  'version' | 'webDir' | 'licensesDir' | 'stateDir' | 'dataDir'
> &
  Partial<
    Pick<ServeConfig, 'vpnDir' | 'gluetunUrl' | 'qbittorrentUrl' | 'homeIpUrls' | 'trustedClients'>
  >;

export interface Services {
  lock: Mutex;
  vpn: VpnService;
  portSync: PortSync;
}

/** Long-lived services, built once per process (server.ts starts the port-sync timer). */
export function createServices(config: AppConfig, logger?: Logger, lock = new Mutex()): Services {
  const gluetun = new GluetunClient({
    baseUrl: config.gluetunUrl ?? 'http://127.0.0.1:8000',
    apiKey: async () => (await secretsStore(config.stateDir).load()).value.apiKeys['gluetun'],
  });
  const vpn = new VpnService({
    stateDir: config.stateDir,
    files: new VpnFiles(config.vpnDir ?? path.join(config.stateDir, 'vpn')),
    gluetun,
    lock,
    homeIpUrls: config.homeIpUrls ?? [],
    ...(logger ? { log: logger } : {}),
  });
  const portSync = new PortSync(
    () => vpn.desiredListenPort(),
    new QbittorrentClient(config.qbittorrentUrl ?? 'http://127.0.0.1:8090'),
    logger,
  );
  return { lock, vpn, portSync };
}

export interface BuildAppOptions {
  config: AppConfig;
  logger?: Logger;
  /** Override hardware detection (tests, e2e). */
  collectSystemInfo?: () => Promise<SystemInfo>;
  services?: Services;
}

/** "::ffff:10.21.0.1" → "10.21.0.1" */
const normalizeIp = (ip: string | undefined) => (ip ?? '').replace(/^::ffff:/i, '');

export async function buildApp({
  config,
  logger,
  collectSystemInfo: collect,
  services,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    ...(logger ? { loggerInstance: logger as FastifyBaseLogger } : { logger: false }),
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: true,
  });
  const svc = services ?? createServices(config, logger);
  const trusted = new Set(config.trustedClients ?? ['127.0.0.1', '::1']);

  await app.register(helmet, {
    // Umbrel serves apps over plain HTTP *and* HTTPS on the same host. HSTS would force HTTPS for
    // every app on umbrel.local, and upgrade-insecure-requests would break HTTP access (D-032).
    hsts: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'upgrade-insecure-requests': null,
        // Radix/motion set inline styles.
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'frame-ancestors': ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/') || request.url.startsWith('/api/health')) return;
    // Only Umbrel's app gateway (behind the Umbrel login) and loopback may use the API. Every Umbrel
    // app shares one Docker network, so without this any other app could read or change EasyArr's
    // settings. The socket address is used on purpose: X-Forwarded-For can be forged (D-041).
    const remote = normalizeIp(request.socket.remoteAddress);
    if (!trusted.has(remote)) {
      request.log.warn({ remote }, 'API request from an untrusted address refused');
      return reply.code(403).send({ error: 'forbidden' });
    }
    // State-changing API calls must be JSON. Browsers only send JSON cross-site after a CORS
    // preflight, which we never answer, so other sites can't post to the API behind the user's
    // Umbrel login (simple form posts use text/plain or form encodings) (D-038).
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const type = String(request.headers['content-type'] ?? '')
      .split(';')[0]
      ?.trim();
    if (type !== 'application/json') {
      return reply.code(415).send({ error: 'unsupported_media_type' });
    }
  });

  app.get('/api/health', async () => ({ status: 'ok', name: APP_NAME, version: config.version }));

  await app.register(wizardRoutes, {
    stateDir: config.stateDir,
    collectSystemInfo: collect ?? (() => collectSystemInfo({ dataDir: config.dataDir })),
    lock: svc.lock,
  });
  await app.register(vpnRoutes, { vpn: svc.vpn, portSync: svc.portSync });

  // License notices shipped in the image (SPEC §14.1), linked from the About page.
  if (existsSync(config.licensesDir)) {
    await app.register(fastifyStatic, {
      root: config.licensesDir,
      prefix: '/licenses/',
      decorateReply: false,
      index: false,
    });
  }

  const hasWeb = existsSync(path.join(config.webDir, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, { root: config.webDir, prefix: '/' });
  }

  app.setNotFoundHandler(async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? '';
    // API routes and missing files (anything with an extension) are real 404s.
    if (
      pathname.startsWith('/api/') ||
      /\.[a-z0-9]+$/i.test(pathname) ||
      request.method !== 'GET' ||
      !hasWeb
    ) {
      return reply.code(404).send({ error: 'not_found' });
    }
    // Single-page app: let the client router handle the path.
    return reply.type('text/html').sendFile('index.html', config.webDir);
  });

  return app;
}
