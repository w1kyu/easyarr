import { parseHelpContext } from '@easyarr/shared';
import type { FastifyInstance } from 'fastify';
import { useApiErrorHandler } from '../http-errors.js';
import { RedactionError, type DiagnosticsService } from './diagnostics.js';

export interface SupportRoutesOptions {
  diagnostics: DiagnosticsService;
}

interface Query {
  context?: string;
  error?: string;
  privateIps?: string;
}

const yes = (v: string | undefined) => v === '1' || v === 'true';

/**
 * GET /api/diagnostics (zip) and GET /api/diagnostics/ai-prompt (SPEC §13). Both are read-only,
 * behind the same address check as the rest of the API, and never cached.
 */
export async function supportRoutes(app: FastifyInstance, opts: SupportRoutesOptions) {
  useApiErrorHandler(app);

  const refuse = (err: unknown) => {
    if (!(err instanceof RedactionError)) throw err;
    // Fail closed: better no bundle than one with a password in it.
    app.log.error({ err: err.message }, 'diagnostics refused');
    return { error: 'redaction_failed' };
  };

  app.get<{ Querystring: Query }>('/api/diagnostics', async (request, reply) => {
    void reply.header('cache-control', 'no-store');
    try {
      const { name, zip } = await opts.diagnostics.bundle({
        privateIps: yes(request.query.privateIps),
      });
      return await reply
        .header('content-type', 'application/zip')
        .header('content-disposition', `attachment; filename="${name}"`)
        .send(Buffer.from(zip));
    } catch (err) {
      return reply.code(500).send(refuse(err));
    }
  });

  app.get<{ Querystring: Query }>('/api/diagnostics/ai-prompt', async (request, reply) => {
    void reply.header('cache-control', 'no-store');
    try {
      return await opts.diagnostics.aiPrompt(
        parseHelpContext(request.query.context),
        request.query.error,
        { privateIps: yes(request.query.privateIps) },
      );
    } catch (err) {
      return reply.code(500).send(refuse(err));
    }
  });
}
