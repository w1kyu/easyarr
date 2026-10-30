import type { SystemCheckItem, Verdict } from '@easyarr/shared';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, CircleX, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '~/lib/api';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loading } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import {
  issuesToFieldErrors,
  useIssueText,
  useSaveErrorText,
  useSaveStep,
  type FieldErrors,
  type StepFormProps,
} from '../wizard-api';

const ICON: Record<Verdict, { icon: typeof CircleCheck; className: string }> = {
  ok: { icon: CircleCheck, className: 'text-emerald-400' },
  warning: { icon: CircleAlert, className: 'text-amber-400' },
  error: { icon: CircleX, className: 'text-red-400' },
};

function CheckRow({ item }: { item: SystemCheckItem }) {
  const { t } = useTranslation();
  const { icon: Icon, className } = ICON[item.verdict];
  return (
    <li
      className="flex items-start gap-3 rounded-12 border border-white/8 bg-white/4 p-3.5"
      data-testid={`system-${item.id}`}
      data-verdict={item.verdict}
    >
      <Icon className={cn('mt-0.5 size-5 shrink-0', className)} aria-hidden />
      <div className="min-w-0">
        <p className="text-14 font-semibold -tracking-2">
          {t(`system.${item.id}.title`)}
          <span className="sr-only">: {t(`system.verdict.${item.verdict}`)}</span>
        </p>
        <p className="mt-0.5 text-13 leading-relaxed text-white/65">
          {t(item.reason, item.values)}
        </p>
      </div>
    </li>
  );
}

/** Step 2: automatic system check with plain ✅ / ⚠️ / ❌ verdicts (SPEC §8). */
export function SystemStep({ formId, view, onSaved }: StepFormProps) {
  const { t } = useTranslation();
  const check = useQuery({ queryKey: ['system-check'], queryFn: api.systemCheck });
  const save = useSaveStep('system');
  const issueText = useIssueText();
  const errorText = useSaveErrorText();
  const [acknowledged, setAcknowledged] = useState(
    view.answers.system?.acknowledgedProblems ?? false,
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const hasProblem = check.data?.overall === 'error';

  return (
    <form
      id={formId}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!check.data) return;
        if (hasProblem && !acknowledged) {
          setErrors({ acknowledgedProblems: t('wizard.error.acknowledgeRequired') });
          return;
        }
        setErrors({});
        save.mutate(
          { acknowledgedProblems: hasProblem && acknowledged },
          {
            onSuccess: onSaved,
            onError: (err) => {
              if (err instanceof ApiError) setErrors(issuesToFieldErrors(err.issues, issueText));
            },
          },
        );
      }}
    >
      {check.isPending && <Loading>{t('system.checking')}</Loading>}
      {check.isError && <ErrorAlert description={t('system.failed')} />}
      {check.data && (
        <>
          <p className="text-14 font-medium text-white/80" role="status">
            {t(`system.summary.${check.data.overall}`)}
          </p>
          <ul className="flex flex-col gap-2">
            {check.data.items.map((item) => (
              <CheckRow key={item.id} item={item} />
            ))}
          </ul>
        </>
      )}
      <Button
        size="sm"
        className="self-start"
        onClick={() => void check.refetch()}
        disabled={check.isFetching}
      >
        <RefreshCw className={cn('size-3', check.isFetching && 'animate-spin')} aria-hidden />
        {t('system.recheck')}
      </Button>
      {hasProblem && (
        <div className="flex flex-col gap-1">
          <label className="flex items-start gap-2.5 text-14 text-white/80">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
              className="mt-0.5"
            />
            {t('system.acknowledge')}
          </label>
          {errors['acknowledgedProblems'] && (
            <p className="text-13 text-destructive2-lightest">{errors['acknowledgedProblems']}</p>
          )}
        </div>
      )}
      {save.isError && !errors['acknowledgedProblems'] && (
        <ErrorAlert description={errorText(save.error)} />
      )}
    </form>
  );
}
