import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Frosted-glass surface using the vendored umbrelOS material tokens. */
export function GlassPanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('umbrel-material umbrel-material-modal rounded-24 p-5 md:p-7', className)}
      {...props}
    />
  );
}
