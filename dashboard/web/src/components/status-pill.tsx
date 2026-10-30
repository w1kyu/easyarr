import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type Status = 'ok' | 'warning' | 'error' | 'idle';

const dot: Record<Status, string> = {
  ok: 'bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60',
  warning: 'bg-amber-400 shadow-[0_0_8px] shadow-amber-400/60',
  error: 'bg-red-500 shadow-[0_0_8px] shadow-red-500/60',
  idle: 'bg-white/40',
};

/** Small status indicator. `label` overrides the default wording for the status. */
export function StatusPill({
  status,
  label,
  className,
}: {
  status: Status;
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-12 font-medium text-white/80',
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', dot[status])} />
      {label ?? t(`status.${status}`)}
    </span>
  );
}
