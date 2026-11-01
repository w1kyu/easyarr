import { useMutation, useQuery } from '@tanstack/react-query';
import { BookOpen, CircleCheck, ExternalLink, RefreshCw, TriangleAlert } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '~/lib/api';
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
import { Loading } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import { useIssueText, useSaveErrorText, useSaveStep, type StepFormProps } from '../wizard-api';

const DocView = lazy(() => import('~/features/docs/doc-view'));
export const PROWLARR_INDEXERS_KEY = ['prowlarr-indexers'] as const;

/**
 * Step 7 (torrents, SPEC §8): the user adds search sites in Prowlarr (new tab) following the guide
 * next to it; EasyArr then checks Prowlarr has at least one. No trackers are suggested.
 */
export function IndexersStep({ formId, onSaved }: StepFormProps) {
  const { t } = useTranslation();
  const save = useSaveStep('indexers');
  const issueText = useIssueText();
  const errorText = useSaveErrorText();
  const [showGuide, setShowGuide] = useState(false);
  const [confirmLater, setConfirmLater] = useState(false);
  const status = useQuery({
    queryKey: PROWLARR_INDEXERS_KEY,
    queryFn: api.prowlarrIndexers,
    // Notices indexers added in the other tab without a click.
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
  const check = useMutation({
    mutationFn: async () => (await status.refetch()).data,
  });
  const count = status.data?.count ?? 0;
  const issue =
    save.error instanceof ApiError && save.error.issues[0]
      ? issueText(save.error.issues[0].message)
      : null;

  return (
    <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <aside>
          <button
            type="button"
            className="mb-2 inline-flex items-center gap-1.5 text-13 font-medium text-white/70 hover:text-white lg:hidden"
            onClick={() => setShowGuide((s) => !s)}
            aria-expanded={showGuide}
          >
            <BookOpen className="size-4" aria-hidden />
            {t(showGuide ? 'indexers.guide.hide' : 'indexers.guide.show')}
          </button>
          <div
            className={cn(
              'max-h-[60vh] overflow-y-auto rounded-16 border border-white/8 bg-black/15 p-4 lg:block',
              !showGuide && 'hidden',
            )}
            data-testid="indexers-guide"
          >
            <Suspense fallback={<Loading />}>
              <DocView slug="indexers" onNavigate={() => undefined} />
            </Suspense>
          </div>
        </aside>

        <form
          id={formId}
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (count > 0) save.mutate({ mode: 'added' }, { onSuccess: onSaved });
            else setConfirmLater(true);
          }}
        >
          <ol className="flex flex-col gap-3 text-14 leading-relaxed text-white/80">
            <li className="flex gap-3">
              <Num n={1} />
              <div className="flex flex-col items-start gap-2">
                <span>{t('indexers.step1')}</span>
                <a
                  href="/apps/prowlarr/"
                  target="_blank"
                  rel="noopener"
                  className={buttonVariants({ size: 'md', variant: 'primary' })}
                >
                  {t('indexers.openProwlarr')} <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </div>
            </li>
            <li className="flex gap-3">
              <Num n={2} />
              <span>{t('indexers.step2')}</span>
            </li>
            <li className="flex gap-3">
              <Num n={3} />
              <span>{t('indexers.step3')}</span>
            </li>
          </ol>

          <div
            className="flex flex-col gap-3 rounded-16 border border-white/10 bg-white/4 p-4"
            data-testid="indexers-status"
            data-count={count}
          >
            {status.isPending ? (
              <p className="text-13 text-white/60">{t('indexers.checking')}</p>
            ) : status.data && !status.data.reachable ? (
              <p className="flex items-start gap-2 text-13 text-amber-200">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t('indexers.unreachable')}
              </p>
            ) : count > 0 ? (
              <p className="flex items-start gap-2 text-14 text-emerald-300">
                <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t(count === 1 ? 'indexers.foundOne' : 'indexers.foundMany', { count })}
              </p>
            ) : (
              <p className="text-13 text-white/65">{t('indexers.none')}</p>
            )}
            <Button
              type="button"
              size="sm"
              className="self-start"
              disabled={check.isPending || status.isFetching}
              onClick={() => check.mutate()}
            >
              <RefreshCw className="size-3.5" aria-hidden /> {t('indexers.checkAgain')}
            </Button>
          </div>
          <p className="text-13 leading-relaxed text-white/55">{t('indexers.vpnNote')}</p>
          {issue && <ErrorAlert description={issue} />}
          {save.isError && !issue && <ErrorAlert description={errorText(save.error)} />}
        </form>
      </div>

      <AlertDialog open={confirmLater} onOpenChange={setConfirmLater}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('indexers.laterTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('indexers.laterBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setConfirmLater(false);
                save.mutate({ mode: 'later' }, { onSuccess: onSaved });
              }}
            >
              {t('indexers.laterConfirm')}
            </AlertDialogAction>
            <AlertDialogCancel>{t('indexers.laterCancel')}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Num({ n }: { n: number }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-12 font-semibold">
      {n}
    </span>
  );
}

/** "Next" once Prowlarr has an indexer, otherwise "Do this later". */
export function IndexersNextLabel() {
  const { t } = useTranslation();
  const status = useQuery({ queryKey: PROWLARR_INDEXERS_KEY, queryFn: api.prowlarrIndexers });
  return <>{t((status.data?.count ?? 0) > 0 ? 'wizard.next' : 'indexers.later')}</>;
}
