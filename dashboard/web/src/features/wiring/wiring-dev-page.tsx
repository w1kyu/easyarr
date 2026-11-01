import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SERVICES, type ServiceId } from '@easyarr/shared';
import { Cable } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassPanel } from '~/components/glass-panel';
import { ServiceIcon } from '~/components/service-icon';
import { StatusPill, type Status } from '~/components/status-pill';
import { ErrorAlert, InfoAlert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  api,
  ApiError,
  runWiring,
  type WiringEvent,
  type WiringNote,
  type WiringStepState,
} from '~/lib/api';

interface StepRow {
  id: string;
  service: string;
  state: WiringStepState;
  changes?: number;
  notes?: WiringNote[];
  error?: { message: string; details: string[] };
}

const pill: Record<WiringStepState, Status> = {
  pending: 'idle',
  waiting: 'idle',
  running: 'warning',
  done: 'ok',
  failed: 'error',
  skipped: 'idle',
};

/**
 * Temporary page (phase 05) to connect the apps by hand until the wizard's Finish step does it
 * (phase 06). Not linked from the menu: /dev/wiring.
 */
export function WiringDevPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['wiring'], queryFn: api.wiring });
  const [rows, setRows] = useState<StepRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; changes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onEvent = (e: WiringEvent) => {
    if (e.type === 'start') setRows(e.steps.map((s) => ({ ...s, state: 'pending' })));
    if (e.type === 'step') {
      setRows((r) =>
        r.map((row) =>
          row.id === e.step
            ? {
                ...row,
                state: e.state,
                ...(e.changes !== undefined ? { changes: e.changes } : {}),
                ...(e.notes ? { notes: e.notes } : {}),
                ...(e.error ? { error: e.error } : {}),
              }
            : row,
        ),
      );
    }
    if (e.type === 'end') setResult({ ok: e.ok, changes: e.changes });
    if (e.type === 'error') setError(e.error);
  };

  const start = async (mode: 'run' | 'repair') => {
    setBusy(true);
    setResult(null);
    setError(null);
    setRows([]);
    try {
      await runWiring(mode, onEvent);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'network');
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: ['wiring'] });
    }
  };

  const errorText = (code: string) =>
    t(`wiring.error.${code}`, { defaultValue: t('wiring.error.generic') });

  return (
    <div className="flex flex-col gap-4">
      <GlassPanel className="flex flex-col gap-3">
        <h1 className="flex items-center gap-2 text-20 font-semibold">
          <Cable className="size-5" aria-hidden /> {t('wiring.title')}
        </h1>
        <p className="text-white/70">{t('wiring.intro')}</p>
        {status.data?.lastRun && (
          <p className="text-13 text-white/60">
            {t(status.data.lastRun.ok ? 'wiring.lastRun.ok' : 'wiring.lastRun.failed', {
              when: new Date(status.data.lastRun.at).toLocaleString(),
            })}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={() => void start('run')}>
            {busy ? t('wiring.running') : t('wiring.run')}
          </Button>
          <Button disabled={busy} onClick={() => void start('repair')}>
            {t('wiring.repair')}
          </Button>
        </div>
        <p className="text-13 text-white/60">{t('wiring.repairHint')}</p>
      </GlassPanel>

      {error && <ErrorAlert description={errorText(error)} />}
      {result &&
        (result.ok ? (
          <InfoAlert description={t('wiring.done', { count: result.changes })} />
        ) : (
          <ErrorAlert description={t('wiring.someFailed')} />
        ))}

      {rows.length > 0 && (
        <GlassPanel>
          <ul className="flex flex-col divide-y divide-white/10">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-1 py-2.5">
                <div className="flex items-center gap-3">
                  <ServiceIcon id={row.service as ServiceId} size={24} />
                  <span className="flex-1">
                    {t(`wiring.step.${row.id}`, { defaultValue: row.id })}
                  </span>
                  <StatusPill status={pill[row.state]} label={t(`wiring.state.${row.state}`)} />
                </div>
                {row.error && (
                  <p className="ps-9 text-13 text-red-300">
                    {row.error.details.includes('jellyfin_other_account')
                      ? t('wiring.problem.jellyfinOtherAccount')
                      : [row.error.message, ...row.error.details].join(' — ')}
                  </p>
                )}
                {row.notes?.map((n) => (
                  <p key={`${n.code}-${n.name}`} className="ps-9 text-13 text-white/60">
                    {t(`wiring.note.${n.code}`, { name: n.name })}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </GlassPanel>
      )}

      <GlassPanel className="flex flex-col gap-3">
        <h2 className="text-15 font-semibold text-white/70">{t('wiring.open')}</h2>
        <div className="flex flex-wrap gap-2">
          {SERVICES.filter((s) => s.urlBase).map((s) => (
            // Full page loads: the service UIs aren't part of this web app.
            <a key={s.id} href={`${s.urlBase}/`} className={buttonVariants({ size: 'sm' })}>
              <ServiceIcon id={s.id} size={16} /> {s.name}
            </a>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}
