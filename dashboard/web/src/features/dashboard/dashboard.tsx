import {
  getService,
  getVpnProvider,
  SERVICES,
  type DownloadItem,
  type RecentItem,
  type ServiceId,
  type ServiceStatus,
  type StatusView,
} from '@easyarr/shared';
import {
  ChevronDown,
  Clapperboard,
  Download,
  ExternalLink,
  Film,
  HardDrive,
  Music,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Tv,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { GlassPanel } from '~/components/glass-panel';
import { ServiceIcon } from '~/components/service-icon';
import { StatusPill, type Status } from '~/components/status-pill';
import { ErrorAlert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { Progress } from '@/components/ui/progress';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn } from '@/lib/utils';
import { formatBytes, formatEta, formatSpeed, portUrl } from './format';
import { LogViewer } from './log-viewer';
import { useSetMode, useStatus } from './status-api';
import { StuckList } from './stuck';
import { WarningsBanner } from './warnings';

const JELLYFIN_PORT = getService('jellyfin').publishedPort ?? 39096;
const REQUEST_PORT = getService('jellyseerr').publishedPort ?? 39055;

/** Home screen after setup (SPEC §12): Simple by default, Advanced on request. */
export function Dashboard() {
  const { t } = useTranslation();
  const status = useStatus();
  const setMode = useSetMode();
  // Set when the user switches to Advanced here (not when the page opens in Advanced).
  const [justOpened, setJustOpened] = useState(false);
  const advancedRef = useRef<HTMLDivElement>(null);
  const hintDone = useCallback(() => setJustOpened(false), []);

  if (status.isPending) return <Loading />;
  if (status.isError) {
    return (
      <GlassPanel className="flex flex-col items-start gap-3">
        <ErrorAlert description={t('dash.loadFailed')} />
        <Button size="md" onClick={() => void status.refetch()}>
          {t('wizard.retry')}
        </Button>
      </GlassPanel>
    );
  }
  const view = status.data;
  const advanced = view.mode === 'advanced';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          ariaLabel={t('dash.mode.label')}
          value={view.mode}
          onValueChange={(mode) => {
            // The control reports both the clicked tab and a toggle: act on real changes only.
            if (mode === view.mode) return;
            setJustOpened(mode === 'advanced');
            setMode.mutate(mode);
          }}
          size="lg"
          variant="primary"
          className="h-11 p-1 text-14"
          tabClassName="min-w-28 px-5 font-medium"
          tabs={[
            { id: 'simple', label: t('dash.mode.simple') },
            { id: 'advanced', label: t('dash.mode.advanced') },
          ]}
        />
        <Link to="/settings" className={cn(buttonVariants({ size: 'md' }), 'ml-auto')}>
          <Settings className="size-3.5" aria-hidden />
          {t('dash.settings')}
        </Link>
      </div>

      <WarningsBanner warnings={view.warnings} />
      <StuckList items={view.stuck} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <BigTile
          href={portUrl(JELLYFIN_PORT)}
          icon={Clapperboard}
          title={t('dash.watch.title')}
          body={t('dash.watch.body')}
          tint="from-violet-500/35 to-indigo-600/25"
          testId="tile-watch"
        />
        <BigTile
          href={portUrl(REQUEST_PORT)}
          icon={Sparkles}
          title={t('dash.request.title')}
          body={t('dash.request.body')}
          tint="from-fuchsia-500/35 to-violet-600/25"
          testId="tile-request"
        />
      </div>

      <StatusStrip view={view} />
      <Downloads view={view} />
      <Recent items={view.recent} />

      {advanced && (
        <motion.div
          ref={advancedRef}
          className="flex scroll-mt-4 flex-col gap-5"
          data-testid="advanced-sections"
          initial={justOpened ? { opacity: 0, y: 12 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          <div className="flex items-center gap-3 px-1 pt-2" aria-hidden>
            <span className="h-px flex-1 bg-white/12" />
            <span className="text-12 font-semibold tracking-wide text-brand-lightest uppercase">
              {t('dash.mode.advancedDivider')}
            </span>
            <span className="h-px flex-1 bg-white/12" />
          </div>
          <ServicesGrid services={view.services} />
          <VpnDetails view={view} />
          <LogViewer />
        </motion.div>
      )}
      {advanced && justOpened && <MoreBelowHint target={advancedRef} onDone={hintDone} />}
    </div>
  );
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * After switching to Advanced: the new sections appear below the fold, so a floating "More
 * options below" button points at them. It goes away once the user scrolls or clicks it; it
 * isn't shown at all if the new sections are already on screen.
 */
function MoreBelowHint({
  target,
  onDone,
}: {
  target: React.RefObject<HTMLDivElement | null>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  // Layout effect: decided before the first paint, so an unneeded hint never flashes.
  useLayoutEffect(() => {
    const el = target.current;
    if (!el || el.getBoundingClientRect().top < window.innerHeight - 120) {
      onDone();
      return;
    }
    const startY = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - startY) > 40) onDone();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [target, onDone]);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <motion.button
        type="button"
        data-testid="more-below"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => {
          target.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
          onDone();
        }}
        className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-14 font-medium text-white shadow-lg shadow-black/40 ring-1 ring-white/20 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-hidden"
      >
        {t('dash.mode.moreBelow')}
        <ChevronDown className="size-4 motion-safe:animate-bounce" aria-hidden />
      </motion.button>
    </div>
  );
}

function BigTile({
  href,
  icon: Icon,
  title,
  body,
  tint,
  testId,
}: {
  href: string;
  icon: typeof Clapperboard;
  title: string;
  body: string;
  tint: string;
  testId: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-testid={testId}
      className={cn(
        'group umbrel-material relative flex items-center gap-4 overflow-hidden rounded-24 p-5 transition-transform duration-300 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-hidden md:p-6',
      )}
    >
      <div className={cn('pointer-events-none absolute inset-0 bg-linear-to-br', tint)} />
      <div className="relative grid size-14 shrink-0 place-items-center rounded-17 bg-white/15 ring-1 ring-white/20 md:size-16">
        <Icon className="size-7 text-white md:size-8" aria-hidden />
      </div>
      <div className="relative min-w-0 flex-1">
        <p className="text-20 font-bold -tracking-3 md:text-24">{title}</p>
        <p className="text-13 text-white/70 md:text-14">{body}</p>
      </div>
      <ExternalLink
        className="relative size-4 shrink-0 text-white/50 transition-colors group-hover:text-white/80"
        aria-hidden
      />
    </a>
  );
}

function StatusStrip({ view }: { view: StatusView }) {
  const { t } = useTranslation();
  const vpn = view.vpn;
  const vpnState: Status =
    vpn.connection === 'connected'
      ? 'ok'
      : vpn.connection === 'connecting'
        ? 'warning'
        : vpn.connection === 'not_configured'
          ? 'idle'
          : 'error';
  const vpnLabel =
    vpn.connection === 'connected'
      ? vpn.publicIp?.country
        ? t('dash.strip.vpnCountry', { country: vpn.publicIp.country })
        : t('dash.strip.vpnOn')
      : t(`dash.strip.vpn.${vpn.connection}`);
  const active = view.downloads.items.filter((i) => i.state === 'downloading').length;
  const disk = view.disk;
  const freeShare = disk && disk.totalBytes > 0 ? disk.freeBytes / disk.totalBytes : null;
  return (
    <GlassPanel className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3" data-testid="status-strip">
      <StripItem
        icon={vpn.connection === 'connected' ? ShieldCheck : ShieldAlert}
        label={t('dash.strip.vpn')}
        to="/settings/vpn"
        actionLabel={t('dash.strip.vpnOpen')}
      >
        <StatusPill status={vpnState} label={vpnLabel} />
      </StripItem>
      <StripItem
        icon={Download}
        label={t('dash.strip.downloads')}
        onClick={() =>
          document
            .getElementById('downloads-title')
            ?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' })
        }
        actionLabel={t('dash.strip.downloadsOpen')}
      >
        <span className="text-14 font-medium">
          {active > 0
            ? t('dash.strip.downloading', {
                count: active,
                speed: formatSpeed(view.downloads.speedBps),
              })
            : t('dash.strip.idle')}
        </span>
      </StripItem>
      <StripItem icon={HardDrive} label={t('dash.strip.disk')}>
        <span
          className={cn(
            'text-14 font-medium',
            freeShare !== null && freeShare < 0.1 && 'text-amber-300',
          )}
        >
          {disk
            ? t('dash.strip.diskFree', {
                free: formatBytes(disk.freeBytes),
                total: formatBytes(disk.totalBytes),
              })
            : t('dash.strip.diskUnknown')}
        </span>
      </StripItem>
    </GlassPanel>
  );
}

/** One status item; with `to`/`onClick` the whole item (icon included) is a button. */
function StripItem({
  icon: Icon,
  label,
  children,
  to,
  onClick,
  actionLabel,
}: {
  icon: typeof Download;
  label: string;
  children: React.ReactNode;
  to?: string;
  onClick?: () => void;
  actionLabel?: string;
}) {
  const clickable = to !== undefined || onClick !== undefined;
  const inner = (
    <>
      <div
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-12 bg-white/8',
          clickable && 'transition-colors group-hover:bg-white/15',
        )}
      >
        <Icon className="size-4 text-white/70" aria-hidden />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 text-left">
        <span className="text-12 text-white/50">{label}</span>
        {children}
      </div>
    </>
  );
  const cls =
    'group -m-1.5 flex items-center gap-3 rounded-15 p-1.5 transition-colors hover:bg-white/6 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-hidden';
  if (to !== undefined) {
    return (
      <Link to={to} className={cls} title={actionLabel}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} title={actionLabel}>
        {inner}
      </button>
    );
  }
  return <div className="flex items-center gap-3">{inner}</div>;
}

const DOWNLOAD_STATUS: Record<DownloadItem['state'], Status> = {
  downloading: 'ok',
  queued: 'idle',
  paused: 'idle',
  checking: 'idle',
  metadata: 'warning',
  stalled: 'warning',
  error: 'error',
};

function Downloads({ view }: { view: StatusView }) {
  const { t } = useTranslation();
  const { items, reachable } = view.downloads;
  const unreachable = !reachable.qbittorrent && !reachable.sabnzbd;
  return (
    <section aria-labelledby="downloads-title" data-testid="downloads">
      <SectionTitle id="downloads-title">{t('dash.downloads.title')}</SectionTitle>
      <GlassPanel className="p-2">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-14 text-white/55">
            {unreachable ? t('dash.downloads.unreachable') : t('dash.downloads.empty')}
          </p>
        ) : (
          <ul className="flex flex-col">
            {items.map((item) => (
              <li
                key={`${item.client}-${item.id}`}
                className="flex flex-col gap-2 rounded-15 px-3 py-3"
              >
                <div className="flex items-center gap-3">
                  <p className="min-w-0 flex-1 truncate text-14 font-medium" title={item.name}>
                    {item.name}
                  </p>
                  <StatusPill
                    status={DOWNLOAD_STATUS[item.state]}
                    label={t(`dash.downloads.state.${item.state}`)}
                  />
                </div>
                <Progress value={Math.round(item.progress * 100)} />
                <p className="flex flex-wrap gap-x-3 text-12 text-white/50">
                  <span>{Math.floor(item.progress * 100)} %</span>
                  {item.sizeBytes > 0 && <span>{formatBytes(item.sizeBytes)}</span>}
                  {item.speedBps > 0 && <span>{formatSpeed(item.speedBps)}</span>}
                  {formatEta(item.etaSeconds) && (
                    <span>{t('dash.downloads.eta', { eta: formatEta(item.etaSeconds) })}</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>
    </section>
  );
}

const RECENT_ICON: Record<RecentItem['type'], typeof Film> = {
  movie: Film,
  series: Tv,
  album: Music,
};

function Recent({ items }: { items: RecentItem[] | null }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="recent-title" data-testid="recent">
      <SectionTitle id="recent-title">{t('dash.recent.title')}</SectionTitle>
      {items === null || items.length === 0 ? (
        <GlassPanel className="p-4">
          <p className="text-14 text-white/55">
            {items === null ? t('dash.recent.unavailable') : t('dash.recent.empty')}
          </p>
        </GlassPanel>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => {
            const Icon = RECENT_ICON[item.type];
            return (
              <li key={item.id} className="min-w-0">
                <a
                  href={`${portUrl(JELLYFIN_PORT)}/web/#/details?id=${encodeURIComponent(item.id)}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t('dash.recent.open', { name: item.name })}
                  className="group flex min-w-0 flex-col gap-1.5 rounded-15 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-hidden"
                >
                  <div className="umbrel-material relative aspect-2/3 overflow-hidden rounded-15 transition-transform duration-300 group-hover:-translate-y-0.5">
                    {item.hasImage ? (
                      <img
                        src={`/api/media/${item.id}/image`}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="grid size-full place-items-center">
                        <Icon className="size-8 text-white/40" aria-hidden />
                      </div>
                    )}
                  </div>
                  <p className="truncate text-13 font-medium" title={item.name}>
                    {item.name}
                  </p>
                  <p className="-mt-1 text-12 text-white/45">
                    {[t(`dash.recent.type.${item.type}`), item.year].filter(Boolean).join(' · ')}
                  </p>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const SERVICE_STATUS: Record<ServiceStatus['state'], Status> = {
  ok: 'ok',
  starting: 'warning',
  down: 'error',
  headless: 'idle',
};

function serviceHref(s: ServiceStatus): string | null {
  const info = getService(s.id);
  if (info.publishedPort !== undefined) return portUrl(info.publishedPort);
  return info.urlBase ? `${info.urlBase}/` : null;
}

const SERVICE_GROUPS: { id: string; services: ServiceId[] }[] = [
  { id: 'watch', services: ['jellyfin', 'jellyseerr'] },
  { id: 'find', services: ['sonarr', 'radarr', 'lidarr', 'prowlarr', 'bazarr'] },
  { id: 'download', services: ['qbittorrent', 'sabnzbd'] },
  { id: 'helpers', services: ['cleanuparr', 'flaresolverr', 'recyclarr', 'unpackerr'] },
];

/**
 * Advanced mode: every included app, grouped by what it does, with a one-line description, its
 * state, version and whether it goes through the VPN (SPEC §12). Apps the setup doesn't use are
 * folded away at the end.
 */
function ServicesGrid({ services }: { services: ServiceStatus[] }) {
  const { t } = useTranslation();
  const byId = new Map(services.map((s) => [s.id, s]));
  const used = services.filter((s) => s.used);
  const running = used.filter((s) => s.state === 'ok' || s.state === 'headless').length;
  const problems = used.filter((s) => s.state === 'down').length;
  const unused = SERVICES.map((s) => byId.get(s.id)).filter(
    (s): s is ServiceStatus => s !== undefined && !s.used,
  );
  return (
    <section
      aria-labelledby="services-title"
      data-testid="services"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <SectionTitle id="services-title">{t('home.services')}</SectionTitle>
        <p className="px-1 text-13 text-white/60" data-testid="services-summary">
          {problems > 0
            ? t('dash.apps.summaryProblems', { running, total: used.length, count: problems })
            : t('dash.apps.summary', { running, total: used.length })}
        </p>
      </div>
      {SERVICE_GROUPS.map((g) => {
        const list = g.services
          .map((id) => byId.get(id))
          .filter((s): s is ServiceStatus => s !== undefined && s.used);
        if (list.length === 0) return null;
        return (
          <div key={g.id} className="flex flex-col gap-2" data-group={g.id}>
            <h3 className="px-1 text-13 font-semibold text-white/75">
              {t(`dash.apps.group.${g.id}`)}
            </h3>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((s) => (
                <ServiceTile key={s.id} s={s} />
              ))}
            </ul>
          </div>
        );
      })}
      {unused.length > 0 && (
        <details className="group px-1" data-testid="services-unused">
          <summary className="cursor-pointer text-13 text-white/55 select-none hover:text-white/80">
            {t('dash.apps.unused', { count: unused.length })}
          </summary>
          <ul className="mt-2 grid grid-cols-1 gap-3 opacity-70 sm:grid-cols-2 lg:grid-cols-3">
            {unused.map((s) => (
              <ServiceTile key={s.id} s={s} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ServiceTile({ s }: { s: ServiceStatus }) {
  const { t } = useTranslation();
  const info = getService(s.id);
  const href = serviceHref(s);
  const viaVpn = info.network === 'vpn';
  const body = (
    <>
      <ServiceIcon id={s.id} size={48} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-15 font-semibold -tracking-2">
            {info.name}
            {viaVpn && (
              <span title={t('dash.apps.viaVpn')} className="inline-flex">
                <ShieldCheck
                  className="size-3.5 shrink-0 text-emerald-300/80"
                  aria-label={t('dash.apps.viaVpn')}
                />
              </span>
            )}
          </p>
          <p className="text-12 leading-snug text-white/65">{t(`service.${s.id}`)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            status={s.used || s.state === 'ok' ? SERVICE_STATUS[s.state] : 'idle'}
            label={t(`dash.service.state.${s.state}`)}
          />
          {s.version && (
            <span className="text-11 text-white/45">
              {t('dash.service.version', { version: s.version })}
            </span>
          )}
        </div>
      </div>
      {href && <ExternalLink className="size-4 shrink-0 self-start text-white/40" aria-hidden />}
    </>
  );
  const cls =
    'umbrel-material umbrel-material-popover flex h-full items-start gap-3 rounded-20 p-3.5 transition-transform duration-300';
  return (
    <li data-service={s.id}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={cn(
            cls,
            'hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-hidden',
          )}
          aria-label={t('dash.service.open', { name: info.name })}
        >
          {body}
        </a>
      ) : (
        <div className={cls} title={t('dash.apps.noWindow')}>
          {body}
        </div>
      )}
    </li>
  );
}

function VpnDetails({ view }: { view: StatusView }) {
  const { t } = useTranslation();
  const vpn = view.vpn;
  const pf = vpn.portForwarding;
  const rows: [string, string][] = [
    [t('dash.vpn.state'), t(`dash.strip.vpn.${vpn.connection}`)],
    [
      t('dash.vpn.provider'),
      (vpn.provider && getVpnProvider(vpn.provider)?.name) ?? vpn.provider ?? '—',
    ],
    [t('dash.vpn.protocol'), vpn.protocol ? t(`vpn.protocol.${vpn.protocol}`) : '—'],
    [t('dash.vpn.ip'), vpn.publicIp?.ip ?? '—'],
    [
      t('dash.vpn.location'),
      [vpn.publicIp?.city, vpn.publicIp?.country].filter(Boolean).join(', ') || '—',
    ],
    [
      t('dash.vpn.portForwarding'),
      pf.state === 'active' && pf.port
        ? t('dash.vpn.pfActive', { port: pf.port })
        : t(`dash.vpn.pf.${pf.state}`),
    ],
  ];
  return (
    <section aria-labelledby="vpn-title" data-testid="vpn-details">
      <SectionTitle id="vpn-title">{t('dash.vpn.title')}</SectionTitle>
      <GlassPanel className="p-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 text-14">
              <dt className="text-white/55">{k}</dt>
              <dd className="truncate text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        {vpn.problem && (
          <p className="mt-3 text-13 text-amber-200">
            {t(`vpn.problem.${vpn.problem.code}.title`)}
          </p>
        )}
      </GlassPanel>
    </section>
  );
}

export function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-2.5 px-1 text-13 font-semibold tracking-wide text-white/50 uppercase">
      {children}
    </h2>
  );
}
