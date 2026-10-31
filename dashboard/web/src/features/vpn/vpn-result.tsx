import type { VpnStatusView, VpnTestView } from '@easyarr/shared';
import { CircleAlert, CircleCheck, CircleX, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

function Row({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  const Icon = ok === true ? CircleCheck : ok === false ? CircleX : CircleAlert;
  return (
    <li className="flex items-start gap-2.5 text-14">
      <Icon
        className={cn(
          'mt-0.5 size-4.5 shrink-0',
          ok === true ? 'text-emerald-400' : ok === false ? 'text-red-400' : 'text-amber-400',
        )}
        aria-hidden
      />
      <span className="text-white/85">{children}</span>
    </li>
  );
}

/** "Connecting…" while Gluetun sets up the tunnel. */
export function VpnConnecting({
  status,
  seconds,
}: {
  status: VpnStatusView | undefined;
  seconds: number;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center gap-3 rounded-16 border border-white/10 bg-white/4 p-4"
      role="status"
      data-testid="vpn-connecting"
    >
      <Loader2 className="size-5 shrink-0 animate-spin text-white/70" aria-hidden />
      <div>
        <p className="text-14 font-semibold">{t('vpn.connecting.title')}</p>
        <p className="text-13 text-white/60">
          {t(status?.wrapper === 'running' ? 'vpn.connecting.tunnel' : 'vpn.connecting.applying', {
            seconds,
          })}
        </p>
      </div>
    </div>
  );
}

/** The connection test result (SPEC §9.1 step 4): clear ✅/❌ with a plain reason and a fix. */
export function VpnTestResult({
  result,
  providerName,
}: {
  result: VpnTestView;
  providerName: string;
}) {
  const { t } = useTranslation();
  if (!result.ok) {
    const code = result.code ?? 'unknown';
    return (
      <div
        className="flex flex-col gap-2 rounded-16 border border-red-400/30 bg-red-500/10 p-4"
        data-testid="vpn-result"
        data-ok="false"
        data-code={code}
        role="alert"
      >
        <p className="flex items-center gap-2 text-15 font-semibold">
          <CircleX className="size-5 text-red-400" aria-hidden />
          {t(`vpn.problem.${code}.title`)}
        </p>
        <p className="text-14 leading-relaxed text-white/80">{t(`vpn.problem.${code}.fix`)}</p>
        {result.problemLine && (
          <details className="text-12 text-white/55">
            <summary className="cursor-pointer select-none">{t('vpn.result.details')}</summary>
            <code className="mt-1 block rounded-8 bg-black/30 p-2 break-all whitespace-pre-wrap select-text">
              {result.problemLine}
            </code>
          </details>
        )}
      </div>
    );
  }
  const pf = result.portForwarding;
  return (
    <div
      className="flex flex-col gap-3 rounded-16 border border-emerald-400/25 bg-emerald-500/10 p-4"
      data-testid="vpn-result"
      data-ok="true"
    >
      <p className="flex items-center gap-2 text-15 font-semibold">
        <CircleCheck className="size-5 text-emerald-400" aria-hidden />
        {t('vpn.result.connected', { provider: providerName })}
      </p>
      <ul className="flex flex-col gap-1.5">
        <Row ok={true}>
          {t(result.country ? 'vpn.result.ipCountry' : 'vpn.result.ip', {
            ip: result.publicIp,
            country: result.country,
          })}
        </Row>
        <Row ok={result.homeIpHidden}>
          {t(result.homeIpHidden === null ? 'vpn.result.homeUnknown' : 'vpn.result.homeHidden')}
        </Row>
        <Row ok={pf.mode === 'off' ? null : pf.state === 'active'}>
          {pf.mode === 'off'
            ? t('vpn.result.pfOff')
            : pf.state === 'active'
              ? t('vpn.result.pfActive', { port: pf.port })
              : t('vpn.result.pfWaiting')}
        </Row>
      </ul>
    </div>
  );
}
