import { existsSync } from 'node:fs';
import path from 'node:path';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import { APP_NAME } from '@easyarr/shared';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { SystemInfo } from '@easyarr/shared';
import type { ServeConfig } from './config.js';
import { collectSystemInfo } from './system/check.js';
import { wizardRoutes } from './wizard/routes.js';

export interface BuildAppOptions {
  config: Pick<ServeConfig, 'version' | 'webDir' | 'licensesDir' | 'stateDir' | 'dataDir'>;
  logger?: Logger;
  /** Override hardware detection (tests, e2e). */
  collectSystemInfo?: () => Promise<SystemInfo>;
}

export async function buildApp({
  config,
  logger,
  collectSystemInfo: collect,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    ...(logger ? { loggerInstance: logger as FastifyBaseLogger } : { logger: false }),
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: true,
  });

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

  // State-changing API calls must be JSON. Browsers only send JSON cross-site after a CORS
  // preflight, which we never answer, so other sites can't post to the API behind the user's
  // Umbrel login (simple form posts use text/plain or form encodings) (D-038).
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return;
    }
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
  });

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
