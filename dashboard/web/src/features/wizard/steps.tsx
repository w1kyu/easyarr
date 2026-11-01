import type { WizardStepId } from '@easyarr/shared';
import type { ComponentType } from 'react';
import type { StepFormProps } from './wizard-api';
import { AccountStep } from './steps/account';
import { DownloadStep } from './steps/download';
import { SystemStep } from './steps/system';
import { VpnNextLabel, VpnStep } from './steps/vpn';
import { WelcomeStep } from './steps/welcome';
import { FinishNextLabel, FinishStep } from './steps/finish';
import { IndexersNextLabel, IndexersStep } from './steps/indexers';
import { LibraryStep } from './steps/library';
import { UsenetStep } from './steps/usenet';

export interface StepUi {
  /** i18n keys. */
  title: string;
  intro: string;
  /** Docs page behind the "What's this?" link next to the title. */
  doc?: string;
  Form: ComponentType<StepFormProps>;
  /** Label of the primary button (defaults to "Next"). */
  nextLabel?: string;
  /** A component rendering the label, for labels that depend on state. */
  NextLabel?: ComponentType;
  /** Use the full width (tutorial + form side by side). */
  wide?: boolean;
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
  vpn: {
    title: 'wizard.vpn.title',
    intro: 'wizard.vpn.intro',
    doc: 'vpn/README',
    Form: VpnStep,
    NextLabel: VpnNextLabel,
    wide: true,
  },
  usenet: {
    title: 'wizard.usenet.title',
    intro: 'wizard.usenet.intro',
    doc: 'usenet-101',
    Form: UsenetStep,
  },
  indexers: {
    title: 'wizard.indexers.title',
    intro: 'wizard.indexers.intro',
    doc: 'indexers',
    Form: IndexersStep,
    NextLabel: IndexersNextLabel,
    wide: true,
  },
  library: {
    title: 'wizard.library.title',
    intro: 'wizard.library.intro',
    doc: 'quality-presets',
    Form: LibraryStep,
  },
  finish: {
    title: 'wizard.finish.title',
    intro: 'wizard.finish.intro',
    Form: FinishStep,
    NextLabel: FinishNextLabel,
  },
};
