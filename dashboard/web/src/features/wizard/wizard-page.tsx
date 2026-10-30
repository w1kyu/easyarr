import { canOpenWizardStep, isWizardStepId, type WizardView } from '@easyarr/shared';
import { useIsMutating } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, History } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { GlassPanel } from '~/components/glass-panel';
import { Stepper } from '~/components/stepper';
import { WhatsThis } from '~/features/docs/whats-this';
import { ErrorAlert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { STEP_UI } from './steps';
import { SAVE_MUTATION_KEY, useWizard } from './wizard-api';

const FORM_ID = 'wizard-step-form';

/** Where to go after a step: the next visible step, or home when steps 1–4 are done. */
function pathAfter(view: WizardView, current: string): string {
  const ids = view.steps.map((s) => s.id);
  const next = ids[ids.indexOf(current as (typeof ids)[number]) + 1];
  return next ? `/setup/${next}` : '/';
}

/** /setup → the step to resume at. */
export function SetupIndex() {
  const wizard = useWizard();
  if (wizard.isPending) return <Loading />;
  if (wizard.isError) return <WizardLoadError onRetry={() => void wizard.refetch()} />;
  return <Navigate to={`/setup/${wizard.data.next ?? 'welcome'}`} replace />;
}

function WizardLoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <GlassPanel className="flex flex-col items-start gap-3">
      <ErrorAlert description={t('wizard.error.loadFailed')} />
      <Button size="md" onClick={onRetry}>
        {t('wizard.retry')}
      </Button>
    </GlassPanel>
  );
}

/** The wizard frame: progress, title, "What's this?", the step's form, Back/Next (SPEC §8). */
export function WizardPage() {
  const { t } = useTranslation();
  const { stepId = '' } = useParams();
  const navigate = useNavigate();
  const wizard = useWizard();
  const saving = useIsMutating({ mutationKey: SAVE_MUTATION_KEY }) > 0;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the new step's title so keyboard/screen-reader users know the page changed.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [stepId]);

  if (wizard.isPending) return <Loading />;
  if (wizard.isError) return <WizardLoadError onRetry={() => void wizard.refetch()} />;
  const view = wizard.data;
  if (!isWizardStepId(stepId)) return <Navigate to="/setup" replace />;
  const completed = view.steps.filter((s) => s.completed).map((s) => s.id);
  if (!canOpenWizardStep(stepId, view.answers, completed)) {
    return <Navigate to={`/setup/${view.next ?? 'welcome'}`} replace />;
  }

  const ui = STEP_UI[stepId];
  const index = view.steps.findIndex((s) => s.id === stepId);
  const prev = index > 0 ? view.steps[index - 1] : undefined;
  const { Form } = ui;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Stepper current={index + 1} total={view.steps.length} />
      <GlassPanel className="flex flex-col gap-5">
        <header className="flex flex-col gap-1.5">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-22 font-bold -tracking-3 outline-hidden md:text-24"
          >
            {t(ui.title)}
          </h2>
          <p className="max-w-2xl text-14 leading-relaxed text-white/65">{t(ui.intro)}</p>
          {ui.doc && <WhatsThis slug={ui.doc} className="self-start" />}
        </header>

        {/* key: a fresh form per step, so state never leaks between steps. */}
        <Form
          key={stepId}
          formId={FORM_ID}
          view={view}
          onSaved={(next) => void navigate(pathAfter(next, stepId))}
        />

        <footer className="flex flex-col-reverse gap-2.5 border-t border-white/8 pt-5 sm:flex-row sm:items-center">
          {prev && (
            <Link
              to={`/setup/${prev.id}`}
              className={cn(buttonVariants({ size: 'md' }), 'w-full sm:w-auto')}
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              {t('wizard.back')}
            </Link>
          )}
          {ui.offerRestore && (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* A disabled button can't show a tooltip, so the wrapper carries it. */}
                <span tabIndex={0} className="w-full sm:w-auto">
                  <Button size="md" disabled className="w-full">
                    <History className="size-3.5" aria-hidden />
                    {t('wizard.welcome.restore')}
                    <span className="text-white/60">· {t('wizard.comingSoon')}</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{t('wizard.welcome.restoreSoon')}</TooltipContent>
            </Tooltip>
          )}
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            size="md"
            disabled={saving}
            className="w-full sm:ml-auto sm:w-auto"
          >
            {saving ? t('wizard.saving') : t(ui.nextLabel ?? 'wizard.next')}
            {!saving && <ArrowRight className="size-3.5" aria-hidden />}
          </Button>
        </footer>
      </GlassPanel>
    </div>
  );
}
