import { useSaveStep, useSaveErrorText, type StepFormProps } from '../wizard-api';
import { ErrorAlert } from '@/components/ui/alert';
import { useTranslation } from 'react-i18next';
import { Clapperboard, Download, Search, Tv } from 'lucide-react';
import { WhatsThis } from '~/features/docs/whats-this';

const FLOW = [
  { icon: Search, key: 'wizard.welcome.flow.request' },
  { icon: Download, key: 'wizard.welcome.flow.download' },
  { icon: Clapperboard, key: 'wizard.welcome.flow.sort' },
  { icon: Tv, key: 'wizard.welcome.flow.watch' },
] as const;

/** Step 1: what EasyArr does + the legal note. Submitting = "Start setup". */
export function WelcomeStep({ formId, onSaved }: StepFormProps) {
  const { t } = useTranslation();
  const save = useSaveStep('welcome');
  const errorText = useSaveErrorText();
  return (
    <form
      id={formId}
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ started: true }, { onSuccess: onSaved });
      }}
    >
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {FLOW.map(({ icon: Icon, key }, i) => (
          <li
            key={key}
            className="flex items-start gap-3 rounded-12 border border-white/8 bg-white/4 p-3"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10">
              <Icon className="size-4.5 text-white/80" aria-hidden />
            </span>
            <span className="text-14 leading-snug text-white/80">
              <span className="sr-only">{i + 1}. </span>
              {t(key)}
            </span>
          </li>
        ))}
      </ol>
      <WhatsThis
        slug="how-it-works"
        label={t('wizard.welcome.howItWorks')}
        className="self-start"
      />
      <div className="rounded-12 border border-white/8 bg-white/4 p-3.5 text-13 leading-relaxed text-white/60">
        <p className="font-semibold text-white/80">{t('wizard.welcome.legalTitle')}</p>
        <p className="mt-1">{t('wizard.welcome.legal')}</p>
      </div>
      {save.isError && <ErrorAlert description={errorText(save.error)} />}
    </form>
  );
}
