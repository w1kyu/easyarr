import type { WizardStepId } from '@easyarr/shared';
import type { ComponentType } from 'react';
import type { StepFormProps } from './wizard-api';
import { AccountStep } from './steps/account';
import { DownloadStep } from './steps/download';
import { SystemStep } from './steps/system';
import { WelcomeStep } from './steps/welcome';

export interface StepUi {
  /** i18n keys. */
  title: string;
  intro: string;
  /** Docs page behind the "What's this?" link next to the title. */
  doc?: string;
  Form: ComponentType<StepFormProps>;
  /** Label of the primary button (defaults to "Next"). */
  nextLabel?: string;
  /** The Welcome step offers "Restore from backup" next to "Start setup" (phase 08). */
  offerRestore?: boolean;
}

/**
 * UI half of the step registry. Order, visibility and validation live in @easyarr/shared
 * (`WIZARD_STEPS`), so the server enforces exactly what the UI shows.
 */
export const STEP_UI: Record<WizardStepId, StepUi> = {
  welcome: {
    title: 'wizard.welcome.title',
    intro: 'wizard.welcome.intro',
    Form: WelcomeStep,
    nextLabel: 'wizard.welcome.start',
    offerRestore: true,
  },
  system: {
    title: 'wizard.system.title',
    intro: 'wizard.system.intro',
    doc: 'system-requirements',
    Form: SystemStep,
  },
  account: {
    title: 'wizard.account.title',
    intro: 'wizard.account.intro',
    doc: 'family-accounts',
    Form: AccountStep,
  },
  download: {
    title: 'wizard.download.title',
    intro: 'wizard.download.intro',
    Form: DownloadStep,
  },
};
