import { SERVICES, type ServiceInfo } from '@easyarr/shared';
import { CircleCheckBig } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';
import { GlassPanel } from '~/components/glass-panel';
import { ServiceIcon } from '~/components/service-icon';
import { StatusPill } from '~/components/status-pill';
import { buttonVariants } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import { useWizard } from '~/features/wizard/wizard-api';

function portUrl(port: number): string {
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

/** `/`: the wizard until steps are done (SPEC §8: shown on first open), then the home screen. */
export function Start() {
  const wizard = useWizard();
  if (wizard.isPending) return <Loading />;
  // If the API is unreachable, still show the home screen (it links to Jellyfin etc.).
  if (wizard.data?.next) return <Navigate to={`/setup/${wizard.data.next}`} replace />;
  return <Home />;
}

export function Home() {
  const { t } = useTranslation();
  const published = SERVICES.filter((s) => s.publishedPort !== undefined);
  return (
    <div className="flex flex-col gap-6">
      <GlassPanel className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
        <div className="grid size-14 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-white/15">
          <CircleCheckBig className="size-6 text-white/80" aria-hidden />
        </div>
        <div className="flex-1">
          <h2 className="text-19 font-semibold -tracking-3">{t('home.title')}</h2>
          <p className="mt-1 max-w-2xl text-14 leading-relaxed text-white/65">{t('home.body')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/setup/welcome" className={cn(buttonVariants({ size: 'md' }))}>
            {t('home.review')}
          </Link>
          {published.map((s) => (
            <a
              key={s.id}
              href={portUrl(s.publishedPort ?? 0)}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ size: 'md' }))}
            >
              {t(s.id === 'jellyfin' ? 'home.openJellyfin' : 'home.openRequests')}
            </a>
          ))}
        </div>
      </GlassPanel>

      <section aria-labelledby="services-title">
        <h2
          id="services-title"
          className="mb-3 px-1 text-13 font-semibold tracking-wide text-white/50 uppercase"
        >
          {t('home.services')}
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => (
            <ServiceTile key={s.id} service={s} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function ServiceTile({ service }: { service: ServiceInfo }) {
  const { t } = useTranslation();
  const status =
    service.publishedPort !== undefined
      ? { status: 'ok' as const, label: t('home.port', { port: service.publishedPort }) }
      : service.network === 'vpn'
        ? { status: 'idle' as const, label: t('home.status.vpnLocked') }
        : { status: 'idle' as const, label: t('home.status.waiting') };
  return (
    <li className="umbrel-material umbrel-material-popover flex items-center gap-3 rounded-20 p-3.5 transition-transform duration-300 hover:-translate-y-0.5">
      <ServiceIcon id={service.id} size={52} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="min-w-0">
          <p className="truncate text-15 font-semibold -tracking-2">{service.name}</p>
          <p className="truncate text-12 text-white/55">{t(`service.${service.id}`)}</p>
        </div>
        <StatusPill status={status.status} label={status.label} className="self-start" />
      </div>
    </li>
  );
}
