import type { FastifyInstance } from 'fastify';
import { useApiErrorHandler } from '../http-errors.js';
import type { UsenetService } from './service.js';

/**
 * /api/usenet/test-server, /api/usenet/test-indexer (wizard step 6 "Test" buttons) and
 * /api/prowlarr/indexers (step 7's "I added at least one" check). Tests never save anything.
 */
export async function usenetRoutes(app: FastifyInstance, { usenet }: { usenet: UsenetService }) {
  useApiErrorHandler(app);
  app.post('/api/usenet/test-server', async (request) => usenet.testServer(request.body));
  app.post('/api/usenet/test-indexer', async (request) => usenet.testIndexer(request.body));
  app.get('/api/prowlarr/indexers', async () => usenet.prowlarrIndexers());
}
