import {
  backupFileNameSchema,
  backupSettingsSchema,
  createBackupSchema,
  restoreRequestSchema,
  type RestoreEvent,
} from '@easyarr/shared';
import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import { ApiError, useApiErrorHandler } from '../http-errors.js';
import type { BackupService } from './service.js';

/** Uploads are raw bodies; this header marks them as ours (D-072). */
export const UPLOAD_HEADER = 'x-easyarr-upload';
export const UPLOAD_PATH = '/api/backup/upload';
/** Big enough for a large Sonarr/Jellyfin database; everything is held in memory (D-069). */
const MAX_UPLOAD = 2 * 1024 ** 3 - 1;

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) {
    throw new ApiError(
      400,
      'invalid',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}

const attachment = (name: string) => `attachment; filename="${name}"`;

export async function backupRoutes(app: FastifyInstance, opts: { backup: BackupService }) {
  useApiErrorHandler(app);
  const svc = opts.backup;

  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: MAX_UPLOAD },
    (_req, body, done) => done(null, body),
  );

  app.get('/api/backup', async () => svc.view());

  app.put('/api/backup/settings', async (request) =>
    svc.saveSettings(parse(backupSettingsSchema, request.body)),
  );

  // Manual backup: built on demand and sent straight to the browser (not stored).
  app.post('/api/backup', async (request, reply) => {
    const { password } = parse(createBackupSchema, request.body);
    const { name, data } = await svc.create('manual', password);
    return reply
      .header('content-type', 'application/octet-stream')
      .header('content-disposition', attachment(name))
      .header('cache-control', 'no-store')
      .send(data);
  });

  app.get<{ Params: { name: string } }>('/api/backup/files/:name', async (request, reply) => {
    const name = parse(backupFileNameSchema, request.params.name);
    const data = await svc.readFile(name);
    return reply
      .header('content-type', 'application/octet-stream')
      .header('content-disposition', attachment(name))
      .header('cache-control', 'no-store')
      .send(data);
  });

  app.delete<{ Params: { name: string } }>('/api/backup/files/:name', async (request) => {
    await svc.deleteFile(parse(backupFileNameSchema, request.params.name));
    return { ok: true };
  });

  app.post(UPLOAD_PATH, { bodyLimit: MAX_UPLOAD }, async (request) => {
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      throw new ApiError(400, 'not_a_backup');
    }
    return svc.saveUpload(request.body);
  });

  app.post('/api/backup/inspect', async (request) => {
    const { source, password } = parse(restoreRequestSchema, request.body);
    return svc.inspect(source, password);
  });

  // Streamed like the wiring (server-sent events over a POST: starting it changes things).
  app.post('/api/backup/restore', async (request, reply) => {
    const { source, password } = parse(restoreRequestSchema, request.body);
    const run = await svc.prepareRestore(source, password);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const send = (e: RestoreEvent) => {
      if (!res.writableEnded) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    };
    const keepAlive = setInterval(() => {
      if (!res.writableEnded) res.write(': keep-alive\n\n');
    }, 15_000);
    try {
      // Continues if the browser goes away; the restored state is on disk either way.
      await run(send);
    } catch (err) {
      request.log.error({ err }, 'restore failed');
      if (!res.writableEnded) {
        const code = err instanceof ApiError ? err.code : 'internal';
        res.write(`event: error\ndata: ${JSON.stringify({ error: code })}\n\n`);
      }
    } finally {
      clearInterval(keepAlive);
      res.end();
    }
  });
}
