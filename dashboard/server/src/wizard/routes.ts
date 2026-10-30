import { evaluateSystem, isWizardStepId, type SystemInfo } from '@easyarr/shared';
import type { FastifyInstance } from 'fastify';
import { WizardError, WizardService } from './service.js';

export interface WizardRoutesOptions {
  stateDir: string;
  collectSystemInfo: () => Promise<SystemInfo>;
}

/** GET /api/system-check, GET /api/wizard, GET/POST /api/wizard/:step (SPEC §7.3). */
export async function wizardRoutes(app: FastifyInstance, opts: WizardRoutesOptions) {
  const systemCheck = async () => evaluateSystem(await opts.collectSystemInfo());
  const wizard = new WizardService(opts.stateDir, systemCheck);

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof WizardError) {
      return reply.code(err.status).send({ error: err.code, issues: err.issues });
    }
    // Fastify's own errors (bad JSON, wrong content type, …) keep their status codes.
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: 'bad_request', message: (err as Error).message });
    }
    app.log.error({ err }, 'request failed');
    return reply.code(500).send({ error: 'internal' });
  });

  app.get('/api/system-check', async () => systemCheck());

  app.get('/api/wizard', async () => wizard.view());

  app.get<{ Params: { step: string } }>('/api/wizard/:step', async (request) => {
    const { step } = request.params;
    if (!isWizardStepId(step)) throw new WizardError(404, 'unknown_step');
    const view = await wizard.view();
    return {
      completed: view.steps.find((s) => s.id === step)?.completed ?? false,
      answers: view.answers[step] ?? null,
      account: step === 'account' ? view.account : undefined,
    };
  });

  app.post<{ Params: { step: string } }>('/api/wizard/:step', async (request) => {
    const { step } = request.params;
    if (!isWizardStepId(step)) throw new WizardError(404, 'unknown_step');
    return wizard.saveStep(step, request.body);
  });
}
