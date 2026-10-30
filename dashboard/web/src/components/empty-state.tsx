import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-10 text-center', className)}>
      <div className="grid size-14 place-items-center rounded-full bg-white/8 ring-1 ring-white/10">
        <Icon className="size-6 text-white/70" aria-hidden />
      </div>
      <h3 className="text-15 font-semibold -tracking-2">{title}</h3>
      {children && <p className="max-w-sm text-13 text-white/60">{children}</p>}
      {action}
    </div>
  );
}
