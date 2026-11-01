import { SERVICES, type ServiceId } from '@easyarr/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ServiceIcon } from '~/components/service-icon';
import { StatusPill, type Status } from '~/components/status-pill';
import {
  ApiError,
  runWiring,
  type WiringEvent,
  type WiringNote,
  type WiringStepState,
} from '~/lib/api';

export interface StepRow {
  id: string;
  service: string;
  state: WiringStepState;
  changes?: number;
  notes?: WiringNote[];
  error?: { code: string; service: string; message: string; details: string[] };
}

export type RunResult = { ok: boolean; changes: number } | null;

/** Runs the wiring engine and keeps a live checklist from its server-sent events (SPEC §8 step 9). */
export function useWiringRun() {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<StepRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunResult>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (mode: 'run' | 'repair' = 'run'): Promise<RunResult> => {
      setBusy(true);
      setResult(null);
      setError(null);
      setRows([]);
      let end: RunResult = null;
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
        if (e.type === 'end') {
          end = { ok: e.ok, changes: e.changes };
          setResult(end);
        }
        if (e.type === 'error') setError(e.error);
      };
      try {
        await runWiring(mode, onEvent);
      } catch (err) {
        setError(err instanceof ApiError ? err.code : 'network');
      } finally {
        setBusy(false);
        void queryClient.invalidateQueries({ queryKey: ['wiring'] });
      }
      return end;
    },
    [queryClient],
  );

  return { rows, busy, result, error, start };
}

const pill: Record<WiringStepState, Status> = {
  pending: 'idle',
  waiting: 'idle',
  running: 'warning',
  done: 'ok',
  failed: 'error',
  skipped: 'idle',
};

const serviceName = (id: string) => SERVICES.find((s) => s.id === id)?.name ?? id;

/** A failed step in plain words: what went wrong and what to do (SPEC §10.2, §2 principle 3). */
export function useStepProblem() {
  const { t } = useTranslation();
  return (row: StepRow): string => {
    const e = row.error;
    if (!e) return '';
    const details = e.details.join(' — ');
    const service = serviceName(e.service);
    if (e.details.includes('jellyfin_other_account'))
      return t('wiring.problem.jellyfinOtherAccount');
    if (e.details.includes('usenet_secret_missing')) return t('wiring.problem.usenetSecretMissing');
    if (row.id === 'recyclarr.sync') return t('wiring.problem.recyclarr');
    if (row.id === 'prowlarr.indexers')
      return t('wiring.problem.prowlarrIndexer', { details: details || e.message });
    switch (e.code) {
      case 'unreachable':
      case 'starting':
        return t('wiring.problem.notAnswering', { service });
      case 'auth':
        return t('wiring.problem.auth', { service });
      case 'rejected':
        return t('wiring.problem.rejected', { service, details: details || e.message });
      default:
        return t('wiring.problem.unexpected', { service });
    }
  };
}

/** The live checklist: one line per step, with notes and a plain explanation when it failed. */
export function WiringChecklist({ rows }: { rows: StepRow[] }) {
  const { t } = useTranslation();
  const problem = useStepProblem();
  return (
    <ul className="flex flex-col divide-y divide-white/10" data-testid="wiring-checklist">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-col gap-1 py-2.5"
          data-testid={`wiring-step-${row.id}`}
          data-state={row.state}
        >
          <div className="flex items-center gap-3">
            <ServiceIcon id={row.service as ServiceId} size={24} />
            <span className="flex-1 text-14">
              {t(`wiring.step.${row.id}`, { defaultValue: row.id })}
            </span>
            <StatusPill status={pill[row.state]} label={t(`wiring.state.${row.state}`)} />
          </div>
          {row.error && (
            <div className="flex flex-col gap-1 ps-9">
              <p className="text-13 leading-relaxed text-red-200">{problem(row)}</p>
              <details className="text-12 text-white/45">
                <summary className="cursor-pointer select-none">{t('wiring.details')}</summary>
                <code className="mt-1 block rounded-8 bg-black/30 p-2 break-all whitespace-pre-wrap select-text">
                  {[row.error.message, ...row.error.details].join('\n')}
                </code>
              </details>
            </div>
          )}
          {row.notes?.map((n) => (
            <p key={`${n.code}-${n.name}`} className="ps-9 text-13 text-white/60">
              {t(`wiring.note.${n.code}`, { name: n.name })}
            </p>
          ))}
        </li>
      ))}
    </ul>
  );
}
