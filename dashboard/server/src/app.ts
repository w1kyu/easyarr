import { existsSync } from 'node:fs';
import path from 'node:path';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import { APP_NAME, parseWizardAnswers, serviceUrl } from '@easyarr/shared';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { SystemInfo } from '@easyarr/shared';
import type { ServeConfig } from './config.js';
import { secretsStore, stateStore } from './state/index.js';
import { statusRoutes } from './status/routes.js';
import { IndexerHealer } from './status/indexer-health.js';
import {
  fetchStoreVersion,
  officialJellyfinInstalled,
  StatusService,
  usedServices,
} from './status/service.js';
import { Mutex } from './state/mutex.js';
import { collectSystemInfo, diskSpace } from './system/check.js';
import { VpnFiles } from './vpn/files.js';
import { GluetunClient } from './vpn/gluetun.js';
import { proxyRoutes } from './proxy/routes.js';
import { PortSync, QbittorrentClient } from './vpn/port-sync.js';
import { vpnRoutes } from './vpn/routes.js';
import { VpnService } from './vpn/service.js';
import { createWiring } from './wiring/index.js';
import type { WiringEngine } from './wiring/engine.js';
import { wiringRoutes } from './wiring/routes.js';
import { wizardRoutes } from './wizard/routes.js';
import { usenetRoutes } from './usenet/routes.js';
import { UsenetService } from './usenet/service.js';

export type AppConfig = Pick<
  ServeConfig,
  'version' | 'webDir' | 'licensesDir' | 'stateDir' | 'dataDir'
> &
  Partial<
    Pick<
      ServeConfig,
      | 'vpnDir'
      | 'gluetunUrl'
      | 'qbittorrentUrl'
      | 'homeIpUrls'
      | 'trustedClients'
      | 'serviceUrls'
      | 'publicUrl'
      | 'appVersion'
      | 'recyclarrDir'
    >
  >;

export interface Services {
  lock: Mutex;
  vpn: VpnService;
  portSync: PortSync;
  /** Un-pauses search sites after an outage (server.ts starts its timer). */
  indexers?: IndexerHealer;
  /** Built from the config when left out (tests that only exercise other routes). */
  wiring?: WiringEngine;
}

function wiringFor(
  config: AppConfig,
  lock: Mutex,
  collect: () => Promise<SystemInfo>,
  logger?: Logger,
): WiringEngine {
  return createWiring({
    stateDir: config.stateDir,
    recyclarrDir: config.recyclarrDir ?? path.join(config.stateDir, 'recyclarr'),
    lock,
    serviceUrls: config.serviceUrls ?? {},
    ...(config.publicUrl ? { publicUrl: config.publicUrl } : {}),
    collectSystemInfo: collect,
    ...(logger ? { log: logger } : {}),
  });
}

/** Long-lived services, built once per process (server.ts starts the port-sync timer). */
export function createServices(
  config: AppConfig,
  logger?: Logger,
  lock = new Mutex(),
  collect: () => Promise<SystemInfo> = () => collectSystemInfo({ dataDir: config.dataDir }),
): Services {
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
  const indexers = new IndexerHealer({
    url: (id) => config.serviceUrls?.[id] ?? serviceUrl(id),
    keys: async () => (await secretsStore(config.stateDir).load()).value.apiKeys,
    canReach: async () => {
      const { connection } = await vpn.status();
      if (connection === 'connected') return true;
      if (connection !== 'not_configured') return false;
      // Without a VPN (the user skipped it) the apps go out directly.
      const state = (await stateStore(config.stateDir).load()).value;
      return parseWizardAnswers(state.wizard.answers).vpn?.mode === 'skipped';
    },
    used: async () => usedServices((await stateStore(config.stateDir).load()).value),
    ...(logger ? { log: logger } : {}),
  });
  return { lock, vpn, portSync, indexers, wiring: wiringFor(config, lock, collect, logger) };
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
  const systemInfo = collect ?? (() => collectSystemInfo({ dataDir: config.dataDir }));
  const svc = services ?? createServices(config, logger, undefined, systemInfo);
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
    const isApi = request.url.startsWith('/api/') && !request.url.startsWith('/api/health');
    const isApp = request.url.startsWith('/apps/');
    if (!isApi && !isApp) return;
    // Only Umbrel's app gateway (behind the Umbrel login) and loopback may use the API and the
    // proxied service UIs. Every Umbrel app shares one Docker network, so without this any other app
    // could read or change EasyArr's settings or reach Sonarr & co. through us. The socket address
    // is used on purpose: X-Forwarded-For can be forged (D-041, D-045).
    const remote = normalizeIp(request.socket.remoteAddress);
    if (!trusted.has(remote)) {
      request.log.warn({ remote }, 'API request from an untrusted address refused');
      return reply.code(403).send({ error: 'forbidden' });
    }
    if (isApp) return; // the services bring their own body formats; CSRF is checked by the proxy
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

  const usenet = new UsenetService({
    stateDir: config.stateDir,
    serviceUrls: config.serviceUrls ?? {},
    vpnConnected: async () => (await svc.vpn.status()).connection === 'connected',
  });
  await app.register(wizardRoutes, {
    stateDir: config.stateDir,
    collectSystemInfo: systemInfo,
    lock: svc.lock,
    prowlarrIndexers: () => usenet.prowlarrIndexers(),
  });
  await app.register(usenetRoutes, { usenet });
  await app.register(wiringRoutes, {
    engine: svc.wiring ?? wiringFor(config, svc.lock, systemInfo, logger),
    stateDir: config.stateDir,
    collectSystemInfo: systemInfo,
  });
  await app.register(vpnRoutes, { vpn: svc.vpn, portSync: svc.portSync });
  await app.register(proxyRoutes, { serviceUrls: config.serviceUrls ?? {} });

  const vpnFiles = new VpnFiles(config.vpnDir ?? path.join(config.stateDir, 'vpn'));
  // The update check and the second-Jellyfin probe only make sense on a real Umbrel.
  const onUmbrel = Boolean(config.appVersion);
  const status = new StatusService({
    url: (id) => config.serviceUrls?.[id] ?? serviceUrl(id),
    keys: async () => (await secretsStore(config.stateDir).load()).value.apiKeys,
    version: config.version,
    appVersion: config.appVersion ?? null,
    state: async () => (await stateStore(config.stateDir).load()).value,
    secrets: async () => (await secretsStore(config.stateDir).load()).value,
    vpn: () => svc.vpn.status(),
    disk: () => diskSpace(config.dataDir),
    vpnLog: () => vpnFiles.readLogTail(),
    indexerHealth: () => svc.indexers?.last() ?? null,
    ...(onUmbrel
      ? { latestVersion: () => fetchStoreVersion(), officialJellyfin: officialJellyfinInstalled }
      : {}),
  });
  await app.register(statusRoutes, { status, stateDir: config.stateDir, lock: svc.lock });

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
      pathname.startsWith('/apps/') ||
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
