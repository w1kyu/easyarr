import { LOG_SOURCES, RECHECK_DEFAULT_HOURS, RECHECK_HOURS } from '@easyarr/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiError, useApiErrorHandler } from '../http-errors.js';
import type { Mutex } from '../state/mutex.js';
import { stateStore } from '../state/index.js';
import type { StatusService } from './service.js';
import type { StuckFinder } from './stuck.js';

export interface StatusRoutesOptions {
  status: StatusService;
  stateDir: string;
  lock: Mutex;
  stuck?: StuckFinder;
}

const uiBodySchema = z.object({ mode: z.enum(['simple', 'advanced']) });
const stuckBodySchema = z.object({ action: z.enum(['accept', 'retry', 'replace', 'dismiss']) });
const autoAcceptBodySchema = z.object({ enabled: z.boolean() });
const recheckBodySchema = z.object({
  hours: z.number().refine((h) => (RECHECK_HOURS as readonly number[]).includes(h)),
});

/**
 * Dashboard home (SPEC §7.3, §12): GET /api/status, the Simple/Advanced switch (remembered in
 * state.json), posters from Jellyfin and the redacted log viewer.
 */
export async function statusRoutes(app: FastifyInstance, opts: StatusRoutesOptions) {
  useApiErrorHandler(app);

  app.get('/api/status', async (_request, reply) => {
    void reply.header('cache-control', 'no-store');
    return opts.status.view();
  });

  app.put('/api/ui', async (request) => {
    const parsed = uiBodySchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError(400, 'invalid_body');
    const store = stateStore(opts.stateDir);
    await opts.lock.run(async () => {
      const { value } = await store.load();
      if (value.ui.mode !== parsed.data.mode) {
        await store.save({ ...value, ui: { ...value.ui, mode: parsed.data.mode } });
      }
    });
    return { mode: parsed.data.mode };
  });

  // Settings → Advanced: how often missing movies/episodes are searched again (D-067).
  app.get('/api/settings/recheck', async () => {
    const { value } = await stateStore(opts.stateDir).load();
    return { hours: value.searches?.recheckHours ?? RECHECK_DEFAULT_HOURS };
  });

  app.put('/api/settings/recheck', async (request) => {
    const parsed = recheckBodySchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError(400, 'invalid_body');
    const store = stateStore(opts.stateDir);
    await opts.lock.run(async () => {
      const { value } = await store.load();
      await store.save({
        ...value,
        searches: { ...value.searches, recheckHours: parsed.data.hours },
      });
    });
    return { hours: parsed.data.hours };
  });

  // Home screen "Needs your OK" buttons (D-068).
  app.post<{ Params: { id: string } }>('/api/stuck/:id', async (request) => {
    const parsed = stuckBodySchema.safeParse(request.body);
    if (!parsed.success || !opts.stuck) throw new ApiError(400, 'invalid_body');
    try {
      const result = await opts.stuck.act(request.params.id, parsed.data.action);
      if (result === 'unknown') throw new ApiError(404, 'not_found');
      return { result };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(502, 'service_failed', [{ path: '', message: (err as Error).message }]);
    }
  });

  // Settings → Advanced: take the offered alternative without asking (D-068).
  app.get('/api/settings/auto-accept', async () => {
    const { value } = await stateStore(opts.stateDir).load();
    return { enabled: value.searches?.autoAccept ?? false };
  });

  app.put('/api/settings/auto-accept', async (request) => {
    const parsed = autoAcceptBodySchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError(400, 'invalid_body');
    const store = stateStore(opts.stateDir);
    await opts.lock.run(async () => {
      const { value } = await store.load();
      await store.save({
        ...value,
        searches: {
          recheckHours: value.searches?.recheckHours ?? RECHECK_DEFAULT_HOURS,
          autoAccept: parsed.data.enabled,
        },
      });
    });
    return { enabled: parsed.data.enabled };
  });

  app.get<{ Params: { id: string } }>('/api/media/:id/image', async (request, reply) => {
    const img = await opts.status.image(request.params.id);
    if (!img) throw new ApiError(404, 'not_found');
    return reply
      .header('content-type', img.type)
      .header('cache-control', 'private, max-age=3600')
      .send(Buffer.from(img.body));
  });

  app.get<{ Params: { source: string } }>('/api/logs/:source', async (request, reply) => {
    const source = LOG_SOURCES.find((s) => s === request.params.source);
    if (!source) throw new ApiError(404, 'not_found');
    void reply.header('cache-control', 'no-store');
    return opts.status.log(source);
  });
}
