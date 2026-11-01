import { SERVICES, type WizardView } from '@easyarr/shared';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CircleCheckBig,
  Clapperboard,
  Download,
  ExternalLink,
  MessageCircleQuestion,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react';
import { useWiringRun, WiringChecklist } from '~/features/wiring/checklist';
import { ErrorAlert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSaveErrorText, useSaveStep, type StepFormProps } from '../wizard-api';

type Phase = 'idle' | 'running' | 'ok' | 'failed';

/** The phase is shared with the wizard's primary button (FinishNextLabel). */
let phase: Phase = 'idle';
const listeners = new Set<() => void>();
function setPhase(p: Phase) {
  phase = p;
  for (const l of listeners) l();
}
function usePhase(): Phase {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => phase,
  );
}

export function portUrl(port: number): string {
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

/**
 * Step 9 Finish (SPEC §8): connects everything with a live checklist, explains what failed with
 * Retry and "Get help with AI" (phase 09), and ends with a short "what now" tour.
 */
export function FinishStep({ formId, view, onSaved }: StepFormProps) {
  const { t } = useTranslation();
  const save = useSaveStep('finish');
  const errorText = useSaveErrorText();
  const run = useWiringRun();
  const current = usePhase();
  const [confirmAnyway, setConfirmAnyway] = useState(false);
  // A fresh visit always starts at the summary.
  useEffect(() => {
    setPhase('idle');
    return () => setPhase('idle');
  }, []);

  const start = async () => {
    setPhase('running');
    const end = await run.start('run');
    setPhase(end?.ok ? 'ok' : 'failed');
  };

  const finish = (result: 'ok' | 'problems') => save.mutate({ result }, { onSuccess: onSaved });

  return (
    <>
      <form
        id={formId}
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (current === 'running') return;
          if (current === 'ok') finish('ok');
          else void start();
        }}
      >
        {current === 'idle' && <Summary view={view} />}

        {current === 'ok' && <Tour view={view} />}

        {current === 'failed' && (
          <div
            className="flex flex-col gap-3 rounded-16 border border-amber-300/25 bg-amber-300/8 p-4"
            data-testid="finish-failed"
          >
            <p className="flex items-start gap-2 text-14 leading-relaxed text-amber-100">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {run.error
                ? t(`wiring.error.${run.error}`, { defaultValue: t('wiring.error.generic') })
                : t('finish.failed')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void start()}>
                <RotateCcw className="size-3.5" aria-hidden /> {t('finish.retry')}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button type="button" size="sm" disabled>
                      <MessageCircleQuestion className="size-3.5" aria-hidden />
                      {t('finish.aiHelp')}
                      <span className="text-white/60">· {t('wizard.comingSoon')}</span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t('finish.aiHelpSoon')}</TooltipContent>
              </Tooltip>
              <Button type="button" size="sm" onClick={() => setConfirmAnyway(true)}>
                {t('finish.anyway')}
              </Button>
            </div>
          </div>
        )}

        {run.rows.length > 0 && current !== 'ok' && (
          <div className="rounded-16 border border-white/8 bg-black/15 px-4 py-1">
            {current === 'running' && (
              <p className="pt-3 text-13 text-white/60" role="status">
                {t('finish.running')}
              </p>
            )}
            <WiringChecklist rows={run.rows} />
          </div>
        )}

        {save.isError && <ErrorAlert description={errorText(save.error)} />}
      </form>

      <AlertDialog open={confirmAnyway} onOpenChange={setConfirmAnyway}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('finish.anywayTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('finish.anywayBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setConfirmAnyway(false);
                finish('problems');
              }}
            >
              {t('finish.anywayConfirm')}
            </AlertDialogAction>
            <AlertDialogCancel>{t('finish.anywayCancel')}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** What pressing the button will do, from the answers (plain words, no app jargon). */
function Summary({ view }: { view: WizardView }) {
  const { t } = useTranslation();
  const a = view.answers;
  const method = a.download?.method;
  const items = [
    t(`finish.summary.downloaders.${method ?? 'torrents'}`),
    t('finish.summary.search'),
    t('finish.summary.library'),
    t('finish.summary.requests'),
  ];
  return (
    <div className="flex flex-col gap-3" data-testid="finish-summary">
      <p className="text-14 text-white/75">{t('finish.summary.title')}</p>
      <ul className="flex flex-col gap-2 text-14 leading-relaxed text-white/75">
        {items.map((text) => (
          <li key={text} className="flex gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
            {text}
          </li>
        ))}
      </ul>
      <p className="text-13 text-white/55">{t('finish.summary.time')}</p>
    </div>
  );
}

/** After a successful run: three things to do next (SPEC §8: request, download, watch). */
export function Tour({ view }: { view: WizardView }) {
  const { t } = useTranslation();
  const requests = SERVICES.find((s) => s.id === 'jellyseerr')?.publishedPort ?? 39055;
  const jellyfin = SERVICES.find((s) => s.id === 'jellyfin')?.publishedPort ?? 39096;
  const vpnSkipped = view.answers.vpn?.mode === 'skipped';
  const indexersLater = view.answers.indexers?.mode === 'later';
  const steps = [
    { icon: Clapperboard, key: 'request', href: portUrl(requests) },
    { icon: Download, key: 'download', href: null },
    { icon: CircleCheckBig, key: 'watch', href: portUrl(jellyfin) },
  ] as const;
  return (
    <div className="flex flex-col gap-4" data-testid="finish-tour">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-emerald-400/15 ring-1 ring-emerald-300/30">
          <CircleCheckBig className="size-5 text-emerald-300" aria-hidden />
        </span>
        <div>
          <p className="text-17 font-semibold -tracking-2">{t('finish.done.title')}</p>
          <p className="text-13 text-white/60">{t('finish.done.body')}</p>
        </div>
      </div>
      {(vpnSkipped || indexersLater) && (
        <div className="flex flex-col gap-1.5 rounded-12 border border-amber-300/25 bg-amber-300/8 p-3 text-13 leading-relaxed text-amber-100">
          {vpnSkipped && <p>{t('finish.done.vpnSkipped')}</p>}
          {indexersLater && <p>{t('finish.done.indexersLater')}</p>}
        </div>
      )}
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {steps.map(({ icon: Icon, key, href }, i) => (
          <li
            key={key}
            className="flex flex-col gap-2 rounded-16 border border-white/10 bg-white/4 p-4"
          >
            <span className="flex items-center gap-2 text-15 font-semibold -tracking-2">
              <Icon className="size-4.5 text-white/75" aria-hidden />
              {i + 1}. {t(`finish.tour.${key}.title`)}
            </span>
            <span className="text-13 leading-relaxed text-white/65">
              {t(`finish.tour.${key}.body`)}
            </span>
            {href && (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ size: 'sm' }), 'mt-auto self-start')}
              >
                {t(`finish.tour.${key}.open`)} <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The wizard's primary button follows the run: Connect → Connecting… → Try again / Go to dashboard. */
export function FinishNextLabel() {
  const { t } = useTranslation();
  const p = usePhase();
  return (
    <>
      {t(
        p === 'running'
          ? 'finish.next.running'
          : p === 'ok'
            ? 'finish.next.done'
            : p === 'failed'
              ? 'finish.next.retry'
              : 'finish.next.start',
      )}
    </>
  );
}
