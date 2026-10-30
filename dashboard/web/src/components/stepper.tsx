import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/** Wizard progress: dots + "Step x of y" (used from phase 03). `current` is 1-based. */
export function Stepper({
  current,
  total,
  className,
}: {
  current: number;
  total: number;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div className="flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              i + 1 === current
                ? 'w-6 bg-white'
                : i + 1 < current
                  ? 'w-1.5 bg-white/70'
                  : 'w-1.5 bg-white/20',
            )}
          />
        ))}
      </div>
      <p className="text-12 text-white/50">{t('stepper.step', { current, total })}</p>
    </div>
  );
}
