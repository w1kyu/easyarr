import { describe, expect, it } from 'vitest';
import {
  accountInputSchema,
  canOpenWizardStep,
  nextWizardStep,
  parseWizardAnswers,
  visibleWizardSteps,
  WIZARD_STEP_IDS,
  WIZARD_STEPS,
} from './wizard.js';

const issues = (input: unknown) => {
  const r = accountInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}:${i.message}`);
};

describe('wizard registry', () => {
  it('lists steps 1–4 in order, each with a schema', () => {
    expect(WIZARD_STEPS.map((s) => s.id)).toEqual([...WIZARD_STEP_IDS]);
    expect(WIZARD_STEP_IDS).toEqual(['welcome', 'system', 'account', 'download']);
  });

  it('resumes at the first unfinished visible step', () => {
    expect(nextWizardStep({}, [])).toBe('welcome');
    expect(nextWizardStep({}, ['welcome', 'system'])).toBe('account');
    expect(nextWizardStep({}, ['welcome', 'system', 'account', 'download'])).toBeNull();
    // Order of completion doesn't matter, gaps are found.
    expect(nextWizardStep({}, ['account', 'welcome'])).toBe('system');
  });

  it('never lets the user skip ahead', () => {
    expect(canOpenWizardStep('welcome', {}, [])).toBe(true);
    expect(canOpenWizardStep('account', {}, ['welcome'])).toBe(false);
    expect(canOpenWizardStep('account', {}, ['welcome', 'system'])).toBe(true);
    // Going back to a finished step is fine.
    expect(canOpenWizardStep('system', {}, ['welcome', 'system', 'account'])).toBe(true);
  });

  it('drops stored answers that no longer match their schema', () => {
    expect(
      parseWizardAnswers({
        welcome: { started: true },
        download: { method: 'carrier-pigeon' },
        account: { username: 'kevin', password: 'never-stored' },
        unknownStep: { x: 1 },
      }),
    ).toEqual({ welcome: { started: true }, account: { username: 'kevin' } });
  });

  it('all steps 1–4 are always visible', () => {
    expect(visibleWizardSteps({ download: { method: 'usenet' } })).toHaveLength(4);
  });
});

describe('account input', () => {
  it('accepts a normal username + good password, password optional when already set', () => {
    expect(issues({ username: 'kevin', password: 'summer-rain7' })).toEqual([]);
    expect(issues({ username: 'kevin.m_2' })).toEqual([]);
    expect(accountInputSchema.parse({ username: '  kevin ' }).username).toBe('kevin');
  });

  it('rejects usernames Jellyfin or URLs could choke on, with i18n keys as messages', () => {
    expect(issues({ username: '' })).toEqual([
      'username:wizard.error.usernameRequired',
      'username:wizard.error.usernameInvalid',
    ]);
    for (const bad of ['k', 'with space', '.dot', 'ümlaut', 'a'.repeat(33), 'semi;colon']) {
      expect(issues({ username: bad }), bad).toEqual(['username:wizard.error.usernameInvalid']);
    }
  });

  it('rejects short, long, weak and username-based passwords', () => {
    expect(issues({ username: 'kevin', password: 'short' })).toEqual([
      'password:wizard.error.passwordTooShort',
    ]);
    expect(issues({ username: 'kevin', password: 'x'.repeat(129) })).toContain(
      'password:wizard.error.passwordTooLong',
    );
    expect(issues({ username: 'kevin', password: 'Password123!' })).toEqual([
      'password:wizard.error.passwordWeak',
    ]);
    expect(issues({ username: 'kevin', password: 'kevin-rocks-99' })).toEqual([
      'password:wizard.error.passwordWeak',
    ]);
  });
});
