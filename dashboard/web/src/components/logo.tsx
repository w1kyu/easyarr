import logoUrl from '~/assets/logo.svg';
import { APP_NAME } from '@easyarr/shared';
import { cn } from '@/lib/utils';

export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      alt={APP_NAME}
      className={cn('shrink-0 rounded-[22%] shadow-lg shadow-black/30', className)}
    />
  );
}
