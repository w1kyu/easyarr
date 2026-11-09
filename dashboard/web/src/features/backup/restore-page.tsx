import {
  SERVICES,
  VPN_PROVIDERS,
  type RestoreEvent,
  type RestoreSource,
  type RestoreStepId,
  type RestoreStepState,
  type RestoreSummary,
  type ServiceId,
} from '@easyarr/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Archive,
  CircleCheckBig,
  FileUp,
  KeyRound,
  Link2,
  Shield,
  TriangleAlert,
  Workflow,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Field } from '~/components/field';
import { GlassPanel } from '~/components/glass-panel';
import { ServiceIcon } from '~/components/service-icon';
import { StatusPill, type Status } from '~/components/status-pill';
import { WhatsThis } from '~/features/docs/whats-this';
import { ApiError, backupApi, runRestore } from '~/lib/api';
import { ErrorAlert, WarningAlert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import { formatDate } from './backup-settings';

interface Row {
  id: RestoreStepId;
  state: RestoreStepState;
  error?: { message: string; details: string[] };
  note?: string;
}

const pill: Record<RestoreStepState, Status> = {
  pending: 'idle',
  running: 'warning',
  done: 'ok',
  failed: 'error',
  skipped: 'idle',
};

const STEP_ICON: Partial<Record<RestoreStepId, typeof Archive>> = {
  easyarr: Archive,
  connections: Link2,
  vpn: Shield,
  wiring: Workflow,
};

const appName = (id: string) => SERVICES.find((s) => s.id === id)?.name ?? id;

const errorCode = (err: unknown) => (err instanceof ApiError ? err.code : 'network');

/**
 * /restore (SPEC §11): upload a backup or pick an automatic one → password if encrypted →
 * what will be restored → confirm → live progress. Reached from wizard step 1 and Settings.
 */
export function RestorePage() {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const [params] = useSearchParams();
  const fileParam = params.get('file');
  const [source, setSource] = useState<RestoreSource | null>(
    fileParam ? { kind: 'file', name: fileParam } : null,
  );
  const [ownSummary, setSummary] = useState<RestoreSummary | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [ownError, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [result, setResult] = useState<boolean | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // An automatic backup picked in Settings: read it right away.
  const picked = useQuery({
    queryKey: ['backup-inspect', fileParam],
    queryFn: () => backupApi.inspect({ kind: 'file', name: fileParam as string }),
    enabled: Boolean(fileParam),
    retry: false,
    staleTime: Infinity,
  });
  const summary = ownSummary ?? picked.data ?? null;
  const error = ownError ?? (picked.isError ? errorCode(picked.error) : null);
  const loading = busy || picked.isFetching;

  const upload = async (file: File) => {
    setError(null);
    setSummary(null);
    setPassword('');
    setBusy(true);
    try {
      setSummary(await backupApi.upload(file));
      setSource({ kind: 'upload' });
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(false);
    }
  };

  const unlock = async () => {
    if (!source) return;
    setError(null);
    setBusy(true);
    try {
      setSummary(await backupApi.inspect(source, password));
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!source) return;
    setConfirm(false);
    setError(null);
    setRows([]);
    setResult(null);
    const onEvent = (e: RestoreEvent | { type: 'error'; error: string }) => {
      if (e.type === 'start') setRows(e.steps.map((id) => ({ id, state: 'pending' })));
      if (e.type === 'step') {
        setRows((r) =>
          (r ?? []).map((row) =>
            row.id === e.step
              ? {
                  ...row,
                  state: e.state,
                  ...(e.error ? { error: e.error } : {}),
                  ...(e.note ? { note: e.note } : {}),
                }
              : row,
          ),
        );
      }
      if (e.type === 'end') setResult(e.ok);
      if (e.type === 'error') setError(e.error);
    };
    try {
      await runRestore({ source, ...(password ? { password } : {}) }, onEvent);
    } catch (err) {
      setRows(null);
      setError(errorCode(err));
    } finally {
      // Everything changed (wizard, status, settings): drop the cached answers, so the next page
      // doesn't act on the old ones (e.g. send a finished setup back to the wizard).
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'backup-inspect' });
    }
  };

  const running = rows !== null && result === null && !error;
  const native = summary?.native ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link to="/" className={cn(buttonVariants({ size: 'md' }))}>
          <ArrowLeft className="size-3.5" aria-hidden />
          {t('backup.restore.back')}
        </Link>
      </div>
      <GlassPanel className="flex flex-col gap-5" data-testid="restore-page">
        <header className="flex flex-col gap-1.5">
          <h1 className="text-24 font-bold -tracking-3">{t('backup.restore.title')}</h1>
          <p className="max-w-2xl text-14 leading-relaxed text-white/65">
            {t('backup.restore.pageIntro')} <WhatsThis slug="backup-restore" />
          </p>
        </header>

        {rows === null && (
          <>
            {!fileParam && (
              <div className="flex flex-col gap-2">
                <input
                  ref={input}
                  type="file"
                  accept=".easyarr,application/octet-stream"
                  className="sr-only"
                  data-testid="restore-file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = '';
                  }}
                />
                <Button
                  size="md"
                  className="self-start"
                  disabled={busy}
                  onClick={() => input.current?.click()}
                >
                  <FileUp className="size-3.5" aria-hidden />
                  {t(summary ? 'backup.restore.chooseOther' : 'backup.restore.choose')}
                </Button>
                <p className="text-12 text-white/50">{t('backup.restore.chooseHint')}</p>
              </div>
            )}
            {loading && <Loading />}

            {summary && !summary.unlocked && (
              <form
                className="flex flex-col gap-3 md:max-w-md"
                onSubmit={(e) => {
                  e.preventDefault();
                  void unlock();
                }}
              >
                <p className="flex items-center gap-2 text-14">
                  <KeyRound className="size-4 text-white/60" aria-hidden />
                  {t('backup.restore.locked')}
                </p>
                <Field
                  label={t('backup.restore.password')}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button type="submit" variant="primary" size="md" disabled={busy || !password}>
                  {t('backup.restore.unlock')}
                </Button>
              </form>
            )}

            {summary?.unlocked && summary.setup && (
              <section className="flex flex-col gap-3" data-testid="restore-summary">
                <h2 className="text-16 font-semibold">{t('backup.restore.summaryTitle')}</h2>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-14">
                  <dt className="text-white/50">{t('backup.restore.made')}</dt>
                  <dd>
                    {formatDate(summary.createdAt, i18n.language)} ·{' '}
                    {t('backup.restore.version', { version: summary.appVersion })}
                  </dd>
                  <dt className="text-white/50">{t('backup.restore.account')}</dt>
                  <dd>{summary.setup.account ?? '—'}</dd>
                  <dt className="text-white/50">{t('backup.restore.downloads')}</dt>
                  <dd>
                    {summary.setup.downloadMethod
                      ? t(`download.${summary.setup.downloadMethod}.title`)
                      : '—'}
                  </dd>
                  <dt className="text-white/50">{t('backup.restore.vpn')}</dt>
                  <dd>
                    {summary.setup.vpnProvider === 'skipped'
                      ? t('backup.restore.vpnSkipped')
                      : (VPN_PROVIDERS.find((p) => p.id === summary.setup?.vpnProvider)?.name ??
                        summary.setup.vpnProvider ??
                        '—')}
                  </dd>
                  <dt className="text-white/50">{t('backup.restore.libraries')}</dt>
                  <dd>
                    {summary.setup.libraries
                      .map((l) => t(`library.libraries.${l}.title`))
                      .join(', ') || '—'}
                  </dd>
                </dl>
                <div className="flex flex-col gap-1.5 text-13 leading-relaxed text-white/65">
                  <p>
                    {native.length > 0
                      ? t('backup.restore.withHistory', {
                          apps: native.map(appName).join(', '),
                        })
                      : t('backup.restore.settingsOnly')}
                  </p>
                  <p>{t('backup.restore.rebuilt')}</p>
                  <p>{t('backup.restore.notIncluded')}</p>
                </div>
                {summary.skipped.length > 0 && (
                  <WarningAlert
                    icon={TriangleAlert}
                    description={t('backup.restore.skipped', {
                      apps: summary.skipped.map((s) => appName(s.part)).join(', '),
                    })}
                  />
                )}
                {!summary.setup.finished && (
                  <WarningAlert icon={TriangleAlert} description={t('backup.restore.unfinished')} />
                )}
                <WarningAlert icon={TriangleAlert} description={t('backup.restore.replaces')} />
                <Button
                  variant="primary"
                  size="md"
                  className="self-start"
                  onClick={() => setConfirm(true)}
                >
                  {t('backup.restore.start')}
                </Button>
              </section>
            )}
          </>
        )}

        {error && (
          <ErrorAlert
            description={t(`backup.error.${error}`, { defaultValue: t('backup.error.generic') })}
          />
        )}

        {rows !== null && (
          <section className="flex flex-col gap-3" aria-live="polite">
            <h2 className="text-16 font-semibold">
              {t(running ? 'backup.progress.running' : 'backup.progress.title')}
            </h2>
            <ul className="flex flex-col divide-y divide-white/10" data-testid="restore-checklist">
              {rows.map((row) => {
                const Icon = STEP_ICON[row.id];
                return (
                  <li
                    key={row.id}
                    className="flex flex-col gap-1 py-2.5"
                    data-testid={`restore-step-${row.id}`}
                    data-state={row.state}
                  >
                    <div className="flex items-center gap-3">
                      {Icon ? (
                        <span className="grid size-6 place-items-center">
                          <Icon className="size-4.5 text-white/70" aria-hidden />
                        </span>
                      ) : (
                        <ServiceIcon id={row.id as ServiceId} size={24} />
                      )}
                      <span className="flex-1 text-14">
                        {t(`backup.progress.step.${Icon ? row.id : 'native'}`, {
                          app: appName(row.id),
                        })}
                      </span>
                      <StatusPill status={pill[row.state]} label={t(`wiring.state.${row.state}`)} />
                    </div>
                    {row.note && (
                      <p className="ps-9 text-13 leading-relaxed text-white/65">
                        {t(`backup.progress.note.${row.note}`, {
                          app: appName(row.id),
                        })}
                      </p>
                    )}
                    {row.error && (
                      <details className="ps-9 text-12 text-white/45">
                        <summary className="cursor-pointer select-none">
                          {t('wiring.details')}
                        </summary>
                        <code className="mt-1 block rounded-8 bg-black/30 p-2 break-all whitespace-pre-wrap select-text">
                          {[row.error.message, ...row.error.details].join('\n')}
                        </code>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
            {result !== null && (
              <div className="flex flex-col gap-3" data-testid="restore-result" data-ok={result}>
                <p className="flex items-start gap-2 text-14 leading-relaxed">
                  {result ? (
                    <CircleCheckBig
                      className="mt-0.5 size-4 shrink-0 text-emerald-300"
                      aria-hidden
                    />
                  ) : (
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
                  )}
                  {t(result ? 'backup.progress.done' : 'backup.progress.problems')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link to="/" className={cn(buttonVariants({ variant: 'primary', size: 'md' }))}>
                    {t('backup.progress.home')}
                  </Link>
                  {!result && (
                    <Link to="/settings/advanced" className={cn(buttonVariants({ size: 'md' }))}>
                      {t('backup.progress.repair')}
                    </Link>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </GlassPanel>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('backup.restore.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('backup.restore.confirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => void start()}>
              {t('backup.restore.confirm')}
            </AlertDialogAction>
            <AlertDialogCancel>{t('backup.restore.cancel')}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
