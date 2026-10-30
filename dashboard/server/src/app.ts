import { existsSync } from 'node:fs';
import path from 'node:path';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import { APP_NAME } from '@easyarr/shared';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { ServeConfig } from './config.js';

export interface BuildAppOptions {
  config: Pick<ServeConfig, 'version' | 'webDir' | 'licensesDir'>;
  logger?: Logger;
}

export async function buildApp({ config, logger }: BuildAppOptions): Promise<FastifyInstance> {
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

  app.get('/api/health', async () => ({ status: 'ok', name: APP_NAME, version: config.version }));

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
    await app.register(fastifyStatic, { root: config.webDir, prefix: '/', wildcard: false });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/') || request.method !== 'GET' || !hasWeb) {
      return reply.code(404).send({ error: 'not_found' });
    }
    // Single-page app: let the client router handle the path.
    return reply.type('text/html').sendFile('index.html', config.webDir);
  });

  return app;
}
