import { passwordStrength, type PasswordScore } from '@easyarr/shared';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const BAR: Record<PasswordScore, string> = {
  0: 'bg-white/20',
  1: 'bg-red-500',
  2: 'bg-amber-400',
  3: 'bg-lime-400',
  4: 'bg-emerald-400',
};

/** Strength meter for the account password (same scoring the server enforces). */
export function PasswordStrengthMeter({
  password,
  username,
}: {
  password: string;
  username: string;
}) {
  const { t } = useTranslation();
  if (!password) return null;
  const { score, hints } = passwordStrength(password, username);
  return (
    <div
      className="flex flex-col gap-1.5 px-[5px]"
      data-testid="password-strength"
      data-score={score}
    >
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              i <= score ? BAR[score] : 'bg-white/10',
            )}
          />
        ))}
      </div>
      <p className="text-12 text-white/60" aria-live="polite">
        <span className="font-semibold text-white/80">{t(`password.score.${score}`)}</span>
        {hints[0] && <> — {t(`password.hint.${hints[0]}`)}</>}
      </p>
    </div>
  );
}
