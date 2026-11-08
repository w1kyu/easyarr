import { getService, type StatusWarning } from '@easyarr/shared';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Where each warning's button leads (null = nothing to click). */
const ACTION: Record<StatusWarning['code'], { to: string; label: string } | null> = {
  vpnNotConfigured: { to: '/settings/vpn', label: 'dash.warning.action.vpn' },
  vpnDown: { to: '/settings/vpn', label: 'dash.warning.action.vpn' },
  diskLow: null,
  serviceDown: { to: '/settings/advanced', label: 'dash.warning.action.repair' },
  officialJellyfin: { to: '/help/two-jellyfins', label: 'dash.warning.action.learn' },
  updateAvailable: null,
  wiringProblems: { to: '/settings/advanced', label: 'dash.warning.action.repair' },
};

/** SPEC §12 warnings banner: one row per problem, plain words + where to fix it. */
export function WarningsBanner({ warnings }: { warnings: StatusWarning[] }) {
  const { t } = useTranslation();
  if (warnings.length === 0) return null;
  return (
    <section
      aria-label={t('dash.warning.title')}
      className="flex flex-col divide-y divide-amber-300/15 overflow-hidden rounded-20 border border-amber-300/25 bg-amber-300/8"
      data-testid="warnings"
    >
      {warnings.map((w) => {
        const action = ACTION[w.code];
        const services = (w.services ?? []).map((id) => getService(id).name).join(', ');
        return (
          <div
            key={w.code}
            role="alert"
            className="flex flex-col gap-2.5 p-4 sm:flex-row sm:items-center"
            data-warning={w.code}
          >
            <TriangleAlert className="size-5 shrink-0 text-amber-300" aria-hidden />
            <div className="flex-1">
              <p className="text-14 font-semibold text-amber-50">
                {t(`dash.warning.${w.code}.title`, { services, version: w.version ?? '' })}
              </p>
              <p className="text-13 leading-relaxed text-amber-100/75">
                {t(`dash.warning.${w.code}.body`, {
                  services,
                  version: w.version ?? '',
                  percent: w.freePercent ?? 0,
                })}
              </p>
            </div>
            {action && (
              <Link
                to={action.to}
                className={cn(buttonVariants({ size: 'sm' }), 'self-start sm:self-auto')}
              >
                {t(action.label)}
              </Link>
            )}
          </div>
        );
      })}
    </section>
  );
}
