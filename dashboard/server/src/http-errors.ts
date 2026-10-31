import type { FastifyError, FastifyInstance } from 'fastify';

export interface Issue {
  path: string;
  /** An i18n key when we wrote the rule, otherwise zod's English message. */
  message: string;
}

/** An error with a status code and a stable `code` the web app understands. */
export class ApiError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 415 | 502,
    readonly code: string,
    readonly issues: Issue[] = [],
  ) {
    super(code);
  }
}

/** Same error format for every API route plugin. */
export function useApiErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | Error, _request, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.status).send({ error: err.code, issues: err.issues });
    }
    // Fastify's own errors (bad JSON, wrong content type, …) keep their status codes.
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: 'bad_request', message: err.message });
    }
    app.log.error({ err }, 'request failed');
    return reply.code(500).send({ error: 'internal' });
  });
}
