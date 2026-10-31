import {
  accountInputSchema,
  canOpenWizardStep,
  downloadAnswersSchema,
  vpnAnswersSchema,
  getWizardStep,
  nextWizardStep,
  parseWizardAnswers,
  systemAnswersSchema,
  visibleWizardSteps,
  welcomeAnswersSchema,
  type SystemCheckResult,
  type WizardStepId,
  type WizardView,
} from '@easyarr/shared';
import type { z } from 'zod';
import { hashPassword } from '../auth/password.js';
import { ApiError, type Issue } from '../http-errors.js';
import { registerSecrets } from '../logger.js';
import { secretsStore, stateStore, type State } from '../state/index.js';
import type { Mutex } from '../state/mutex.js';

export class WizardError extends ApiError {
  constructor(
    status: 400 | 404 | 409,
    code: 'invalid' | 'unknown_step' | 'previous_steps_incomplete',
    issues: Issue[] = [],
  ) {
    super(status, code, issues);
  }
}

const toIssues = (err: z.ZodError): Issue[] =>
  err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));

function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new WizardError(400, 'invalid', toIssues(r.error));
  return r.data;
}

/**
 * Wizard persistence (SPEC §8, §7.2): answers are saved per step in state.json, so a refresh
 * resumes where the user left off. Writes are serialised — state.json is read-modify-written.
 */
export class WizardService {
  constructor(
    private readonly stateDir: string,
    private readonly systemCheck: () => Promise<SystemCheckResult>,
    private readonly lock: Mutex,
  ) {}

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    return this.lock.run(fn);
  }

  async view(): Promise<WizardView> {
    const { value: state } = await stateStore(this.stateDir).load();
    return toView(state);
  }

  async saveStep(id: WizardStepId, body: unknown): Promise<WizardView> {
    return this.serialize(async () => {
      const store = stateStore(this.stateDir);
      const { value: state } = await store.load();
      const answers = parseWizardAnswers(state.wizard.answers);
      if (!canOpenWizardStep(id, answers, state.wizard.completedSteps)) {
        throw new WizardError(409, 'previous_steps_incomplete');
      }

      let stepAnswers: unknown;
      let account = state.account;
      switch (id) {
        case 'welcome':
          stepAnswers = parseOrThrow(welcomeAnswersSchema, body);
          break;
        case 'system': {
          const parsed = parseOrThrow(systemAnswersSchema, body);
          const check = await this.systemCheck();
          if (check.overall === 'error' && !parsed.acknowledgedProblems) {
            throw new WizardError(400, 'invalid', [
              { path: 'acknowledgedProblems', message: 'wizard.error.acknowledgeRequired' },
            ]);
          }
          stepAnswers = parsed;
          break;
        }
        case 'account': {
          const input = parseOrThrow(accountInputSchema, body);
          if (input.password === undefined && !state.account) {
            throw new WizardError(400, 'invalid', [
              { path: 'password', message: 'wizard.error.passwordRequired' },
            ]);
          }
          let passwordHash = state.account?.passwordHash ?? '';
          if (input.password !== undefined) {
            passwordHash = await hashPassword(input.password);
            const secrets = secretsStore(this.stateDir);
            const loaded = await secrets.load();
            await secrets.save({ ...loaded.value, account: { password: input.password } });
            registerSecrets([input.password]);
          }
          account = {
            username: input.username,
            passwordHash,
            updatedAt: new Date().toISOString(),
          };
          stepAnswers = { username: input.username };
          break;
        }
        case 'download':
          stepAnswers = parseOrThrow(downloadAnswersSchema, body);
          break;
        case 'vpn': {
          // "configured" only after a successful connection test of the current settings
          // (SPEC §8 step 5); "skipped" keeps the kill switch closed.
          const parsed = parseOrThrow(vpnAnswersSchema, body);
          const test = state.vpn?.lastTest;
          if (
            parsed.mode === 'configured' &&
            !(test?.ok && test.at >= (state.vpn?.configuredAt ?? ''))
          ) {
            throw new WizardError(400, 'invalid', [
              { path: 'mode', message: 'wizard.error.vpnNotTested' },
            ]);
          }
          stepAnswers = parsed;
          break;
        }
      }
      // Belt and braces: what we store must match the step's stored-answers schema.
      parseOrThrow(getWizardStep(id).answers, stepAnswers);

      const completed = state.wizard.completedSteps.includes(id)
        ? state.wizard.completedSteps
        : [...state.wizard.completedSteps, id];
      const next: State = {
        ...state,
        account,
        wizard: {
          completedSteps: completed,
          answers: { ...state.wizard.answers, [id]: stepAnswers },
        },
      };
      await store.save(next);
      return toView(next);
    });
  }
}

export function toView(state: State): WizardView {
  const answers = parseWizardAnswers(state.wizard.answers);
  const done = state.wizard.completedSteps;
  return {
    steps: visibleWizardSteps(answers).map((id) => ({ id, completed: done.includes(id) })),
    next: nextWizardStep(answers, done),
    answers,
    account: state.account
      ? { username: state.account.username, hasPassword: state.account.passwordHash !== '' }
      : null,
  };
}
