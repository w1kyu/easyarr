import { evaluateSystem, isWizardStepId, type SystemInfo } from '@easyarr/shared';
import type { FastifyInstance } from 'fastify';
import { useApiErrorHandler } from '../http-errors.js';
import type { Mutex } from '../state/mutex.js';
import { WizardError, WizardService } from './service.js';

export interface WizardRoutesOptions {
  stateDir: string;
  collectSystemInfo: () => Promise<SystemInfo>;
  lock: Mutex;
}

/** GET /api/system-check, GET /api/wizard, GET/POST /api/wizard/:step (SPEC §7.3). */
export async function wizardRoutes(app: FastifyInstance, opts: WizardRoutesOptions) {
  const systemCheck = async () => evaluateSystem(await opts.collectSystemInfo());
  const wizard = new WizardService(opts.stateDir, systemCheck, opts.lock);
  useApiErrorHandler(app);

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
