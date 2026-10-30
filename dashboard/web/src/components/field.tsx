import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Labelled text field with an error line (uses the vendored umbrelOS input style). */
export function Field({
  label,
  error,
  hint,
  className,
  type,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label: string;
  error?: string | undefined;
  hint?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ');
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="px-[5px] text-13 font-medium -tracking-2 text-white/70">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type={isPassword && show ? 'text' : type}
          variant={error ? 'destructive' : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn('text-white/90', isPassword && 'pr-12')}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={t(show ? 'field.hidePassword' : 'field.showPassword')}
            aria-pressed={show}
            className="absolute inset-y-0 right-2 grid w-9 place-items-center rounded-full text-white/50 hover:text-white focus-visible:ring-3 focus-visible:ring-white/20 focus-visible:outline-hidden"
          >
            {show ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        )}
      </div>
      {hint && (
        <div id={`${id}-hint`} className="px-[5px] text-12 text-white/50">
          {hint}
        </div>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="px-[5px] text-13 text-destructive2-lightest">
          {error}
        </p>
      )}
    </div>
  );
}
