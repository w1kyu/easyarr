import {
  finishAnswersSchema,
  indexersAnswersSchema,
  libraryAnswersSchema,
  usenetAnswersSchema,
  usenetInputSchema,
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
  type SavedSecrets,
  type SystemCheckResult,
  type WizardStepId,
  type WizardView,
} from '@easyarr/shared';
import type { z } from 'zod';
import { hashPassword } from '../auth/password.js';
import { ApiError, type Issue } from '../http-errors.js';
import { registerSecrets } from '../logger.js';
import { secretsStore, stateStore, type Secrets, type State } from '../state/index.js';
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
    /** Step 7's check: how many indexers Prowlarr has (reachable=false: Prowlarr isn't answering). */
    private readonly prowlarrIndexers: () => Promise<{ reachable: boolean; count: number }> = () =>
      Promise.resolve({ reachable: false, count: 0 }),
  ) {}

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    return this.lock.run(fn);
  }

  async view(): Promise<WizardView> {
    const { value: state } = await stateStore(this.stateDir).load();
    return toView(state, (await secretsStore(this.stateDir).load()).value);
  }

  /**
   * The saved passwords and API keys, so a reopened step shows them (masked) instead of empty
   * fields (D-064). Read from secrets.json, where they already are; nothing is written.
   */
  async savedSecrets(): Promise<SavedSecrets> {
    const { value } = await secretsStore(this.stateDir).load();
    return {
      account: value.account?.password ?? null,
      usenetServers: { ...value.usenet?.servers },
      usenetIndexers: { ...value.usenet?.indexers },
    };
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
        case 'usenet':
          stepAnswers = await this.saveUsenet(body);
          break;
        case 'indexers': {
          const parsed = parseOrThrow(indexersAnswersSchema, body);
          if (parsed.mode === 'added') {
            const found = await this.prowlarrIndexers();
            if (!found.reachable || found.count === 0) {
              throw new WizardError(400, 'invalid', [
                {
                  path: 'mode',
                  message: found.reachable
                    ? 'wizard.error.noIndexers'
                    : 'wizard.error.prowlarrUnreachable',
                },
              ]);
            }
          }
          stepAnswers = parsed;
          break;
        }
        case 'library':
          stepAnswers = parseOrThrow(libraryAnswersSchema, body);
          break;
        case 'finish': {
          // Finishing needs a wiring run (the Finish step starts it); "ok" needs a run without
          // failures. Changing an earlier answer re-opens this step (below).
          const parsed = parseOrThrow(finishAnswersSchema, body);
          const last = state.wiring.lastRun;
          if (!last || (parsed.result === 'ok' && !last.ok)) {
            throw new WizardError(400, 'invalid', [
              { path: 'result', message: 'wizard.error.wiringNotDone' },
            ]);
          }
          stepAnswers = parsed;
          break;
        }
      }
      // Belt and braces: what we store must match the step's stored-answers schema.
      parseOrThrow(getWizardStep(id).answers, stepAnswers);

      // A changed answer must be applied by the Finish step (it runs the wiring), so saving any
      // other step re-opens Finish.
      const kept =
        id === 'finish'
          ? state.wizard.completedSteps
          : state.wizard.completedSteps.filter((s) => s !== 'finish');
      const completed = kept.includes(id) ? kept : [...kept, id];
      const next: State = {
        ...state,
        account,
        wizard: {
          completedSteps: completed,
          answers: { ...state.wizard.answers, [id]: stepAnswers },
        },
      };
      await store.save(next);
      return toView(next, (await secretsStore(this.stateDir).load()).value);
    });
  }

  /**
   * Step 6: passwords and API keys go to secrets.json (by entry id), the rest to the answers. A
   * secret left empty keeps the saved one; entries that were removed lose theirs.
   */
  private async saveUsenet(body: unknown): Promise<unknown> {
    const input = parseOrThrow(usenetInputSchema, body);
    const secrets = secretsStore(this.stateDir);
    const { value: current } = await secrets.load();
    const saved = current.usenet ?? { servers: {}, indexers: {} };
    const servers: Record<string, string> = {};
    const indexers: Record<string, string> = {};
    const issues: Issue[] = [];
    input.servers.forEach((s, i) => {
      const pw = s.password || saved.servers[s.id];
      if (pw) servers[s.id] = pw;
      else
        issues.push({
          path: `servers.${i}.password`,
          message: 'wizard.error.usenetPasswordRequired',
        });
    });
    input.indexers.forEach((x, i) => {
      const key = x.apiKey || saved.indexers[x.id];
      if (key) indexers[x.id] = key;
      else
        issues.push({
          path: `indexers.${i}.apiKey`,
          message: 'wizard.error.indexerApiKeyRequired',
        });
    });
    if (issues.length) throw new WizardError(400, 'invalid', issues);
    registerSecrets([...Object.values(servers), ...Object.values(indexers)]);
    await secrets.save({ ...current, usenet: { servers, indexers } });
    // The stored-answers schema strips the password/API key fields.
    return usenetAnswersSchema.parse(input);
  }
}

export function toView(state: State, secrets?: Secrets): WizardView {
  const answers = parseWizardAnswers(state.wizard.answers);
  const done = state.wizard.completedSteps;
  return {
    steps: visibleWizardSteps(answers).map((id) => ({ id, completed: done.includes(id) })),
    next: nextWizardStep(answers, done),
    answers,
    account: state.account
      ? { username: state.account.username, hasPassword: state.account.passwordHash !== '' }
      : null,
    usenetSecrets: {
      servers: Object.keys(secrets?.usenet?.servers ?? {}),
      indexers: Object.keys(secrets?.usenet?.indexers ?? {}),
    },
  };
}
