import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** A labelled native <select> in the umbrelOS input style (works well on phones). */
export function SelectField({
  label,
  hint,
  error,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
}) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="px-[5px] text-13 font-medium -tracking-2 text-white/70">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        className={cn(
          'h-12 rounded-full border border-white/10 bg-white/4 px-5 text-15 text-white/90 hover:bg-white/6 focus-visible:border-white/50 focus-visible:outline-hidden [&>option]:bg-neutral-900',
          error && 'border-destructive2-lightest',
        )}
        {...props}
      >
        {children}
      </select>
      {hint && <div className="px-[5px] text-12 text-white/50">{hint}</div>}
      {error && (
        <p role="alert" className="px-[5px] text-13 text-destructive2-lightest">
          {error}
        </p>
      )}
    </div>
  );
}
