import {
  accountInputSchema,
  canOpenWizardStep,
  downloadAnswersSchema,
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
import { registerSecrets } from '../logger.js';
import { secretsStore, stateStore, type State } from '../state/index.js';

export interface Issue {
  path: string;
  /** An i18n key (`wizard.error.*`) when we wrote the rule, otherwise zod's English message. */
  message: string;
}

export class WizardError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: 'invalid' | 'unknown_step' | 'previous_steps_incomplete',
    readonly issues: Issue[] = [],
  ) {
    super(code);
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
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly stateDir: string,
    private readonly systemCheck: () => Promise<SystemCheckResult>,
  ) {}

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
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
