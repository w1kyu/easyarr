import httpProxy from '@fastify/http-proxy';
import { proxiedServices, serviceUrl, type ServiceId } from '@easyarr/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export interface ProxyOptions {
  /** Upstream base URL per service; defaults to the service's container address (D-026). */
  serviceUrls?: Partial<Record<ServiceId, string>>;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** "http://umbrel.local:39000/x" → "umbrel.local:39000"; null if missing or not a URL. */
function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Cross-site request check for everything behind /apps/*. The proxied apps trust the dashboard
 * (they sit behind the Umbrel login), so a page on another site must not be able to make the
 * user's browser send state-changing requests — or open a WebSocket — through it. Browsers send
 * Origin on cross-site POSTs and WebSocket handshakes, Referer on most others.
 * Umbrel's app gateway keeps the browser's Host header (changeOrigin: false).
 */
export function isCrossSite(request: FastifyRequest): boolean {
  const host = String(request.headers['x-forwarded-host'] ?? request.headers.host ?? '')
    .split(',')[0]
    ?.trim()
    .toLowerCase();
  const origin = request.headers.origin;
  if (origin !== undefined) {
    // "null" origins (sandboxed frames, file://) are never ours.
    return hostOf(origin) !== host;
  }
  const referer = hostOf(request.headers.referer);
  return referer !== null && referer !== host;
}

/**
 * Reverse proxy for the service web UIs under /apps/<service>/ (SPEC §5.5, D-045).
 * Services with a URL-base setting get the path unchanged; the others (qBittorrent) get it
 * without the prefix. Origin/Referer are checked here and then dropped, because the services
 * compare them with their own address (qBittorrent's CSRF check would refuse every POST).
 */
export async function proxyRoutes(app: FastifyInstance, opts: ProxyOptions): Promise<void> {
  for (const svc of proxiedServices()) {
    const prefix = svc.urlBase as string;
    const upstream = opts.serviceUrls?.[svc.id] ?? serviceUrl(svc.id);

    // "/apps/sonarr" → "/apps/sonarr/" so relative links resolve inside the app.
    app.get(prefix, { helmet: false }, async (request, reply) => {
      const query = request.url.slice(prefix.length);
      return reply.redirect(`${prefix}/${query}`, 301);
    });

    await app.register(httpProxy, {
      upstream,
      prefix: `${prefix}/`,
      rewritePrefix: svc.stripPrefix ? '/' : `${prefix}/`,
      websocket: true,
      config: { helmet: { skipRoute: true } },
      preHandler: async (request, reply) => {
        // WebSocket handshakes are GETs but count as state-changing (cross-site WebSocket hijacking).
        // They come through here too: the proxy routes upgrades through Fastify's router. Only
        // cookies are forwarded on the upgrade, never Origin.
        const changing = !SAFE_METHODS.has(request.method) || request.headers.upgrade !== undefined;
        if (changing && isCrossSite(request)) {
          request.log.warn(
            { service: svc.id, origin: request.headers.origin },
            'cross-site request refused',
          );
          return reply.code(403).send({ error: 'cross_site_request' });
        }
      },
      replyOptions: {
        rewriteRequestHeaders: (_request, headers) => {
          const rest = { ...headers };
          delete rest.origin;
          delete rest.referer;
          return rest;
        },
        onError: (reply, { error }) => {
          reply.log.warn({ service: svc.id, err: error }, 'service did not answer');
          const { method, headers } = reply.request;
          // Navigations get a friendly page from the web app; API calls a plain status.
          if (method === 'GET' && String(headers.accept ?? '').includes('text/html')) {
            void reply.redirect(`/unavailable/${svc.id}`, 302);
          } else {
            void reply.code(502).send({ error: 'service_unavailable', service: svc.id });
          }
        },
      },
    });
  }
}
