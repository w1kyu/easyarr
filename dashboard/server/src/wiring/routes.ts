import type { SystemInfo } from '@easyarr/shared';
import { parseWizardAnswers } from '@easyarr/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError, useApiErrorHandler } from '../http-errors.js';
import { stateStore, type State } from '../state/index.js';
import {
  WiringBusyError,
  type WiringEngine,
  type WiringEvent,
  type WiringMode,
  type WiringPlan,
} from './engine.js';

/**
 * What to wire, from the wizard answers. Steps 6–8 (Usenet servers, libraries, quality) arrive in
 * phase 06; until then every library is on and the quality preset is "balanced" (phase 05 prompt).
 */
export function planFromState(state: State, system: Pick<SystemInfo, 'gpu'>): WiringPlan {
  const answers = parseWizardAnswers(state.wizard.answers);
  const method = answers.download?.method;
  if (!state.account || !method) throw new ApiError(409, 'wizard_incomplete');
  return {
    torrents: method === 'torrents' || method === 'both',
    usenet: method === 'usenet' || method === 'both',
    libraries: { movies: true, tv: true, music: true },
    quality: 'balanced',
    gpu: system.gpu.kind !== 'none',
  };
}

export interface WiringRoutesOptions {
  engine: WiringEngine;
  stateDir: string;
  collectSystemInfo: () => Promise<SystemInfo>;
}

const runBodySchema = z.object({ mode: z.enum(['run', 'repair']).optional() }).default({});

/**
 * /api/wiring (SPEC §7.3): status + ledger, and runs streamed as server-sent events so the wizard's
 * Finish step can show a live checklist. POST (not EventSource/GET): starting a run changes things.
 */
export async function wiringRoutes(app: FastifyInstance, opts: WiringRoutesOptions) {
  useApiErrorHandler(app);

  app.get('/api/wiring', async () => {
    const { value: state } = await stateStore(opts.stateDir).load();
    return {
      running: opts.engine.isRunning,
      lastRun: state.wiring.lastRun,
      ledger: state.wiring.ledger.map(({ key, service, kind, name, adopted, createdAt }) => ({
        key,
        service,
        kind,
        name,
        adopted,
        createdAt,
      })),
    };
  });

  const stream = async (request: FastifyRequest, reply: FastifyReply, fixedMode?: WiringMode) => {
    const body = runBodySchema.safeParse(request.body ?? {});
    if (!body.success) throw new ApiError(400, 'invalid');
    const mode: WiringMode = fixedMode ?? body.data.mode ?? 'run';
    const { value: state } = await stateStore(opts.stateDir).load();
    const plan = planFromState(state, await opts.collectSystemInfo());
    if (opts.engine.isRunning) throw new ApiError(409, 'wiring_running');

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Umbrel's gateway and other proxies must not buffer the stream.
      'x-accel-buffering': 'no',
    });
    const send = (e: WiringEvent) => {
      if (!res.writableEnded) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    };
    // Comments keep idle connections open while a step waits for a slow service.
    const keepAlive = setInterval(() => {
      if (!res.writableEnded) res.write(': keep-alive\n\n');
    }, 15_000);
    try {
      // The run continues if the browser goes away; the result lands in state.json.
      await opts.engine.run(mode, plan, send);
    } catch (err) {
      if (err instanceof WiringBusyError) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'wiring_running' })}\n\n`);
      } else {
        request.log.error({ err }, 'wiring run failed');
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'internal' })}\n\n`);
      }
    } finally {
      clearInterval(keepAlive);
      res.end();
    }
  };

  app.post('/api/wiring/run', (request, reply) => stream(request, reply));
  app.post('/api/wiring/repair', (request, reply) => stream(request, reply, 'repair'));
}
