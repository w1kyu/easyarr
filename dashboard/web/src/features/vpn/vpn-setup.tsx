import {
  defaultProtocol,
  getVpnProvider,
  providerLocations,
  providerProtocols,
  VPN_FIELDS,
  type VpnConfigView,
  type VpnFieldId,
  type VpnProtocol,
  type VpnProvider,
  type VpnTestView,
} from '@easyarr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, ExternalLink, FileUp, Plug } from 'lucide-react';
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '~/components/field';
import { api, ApiError } from '~/lib/api';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ProviderPicker } from './provider-picker';
import { VpnConnecting, VpnTestResult } from './vpn-result';

const DocView = lazy(() => import('~/features/docs/doc-view'));

export const VPN_CONFIG_KEY = ['vpn-config'] as const;
export const VPN_STATUS_KEY = ['vpn-status'] as const;

interface FormState {
  protocol: VpnProtocol;
  location: string;
  portForwarding: boolean;
  forwardedPort: string;
  freePlan: boolean;
  fields: Partial<Record<VpnFieldId, string>>;
}

function initialForm(provider: VpnProvider, saved: VpnConfigView | null): FormState {
  if (saved && saved.provider === provider.id) {
    return {
      protocol: saved.protocol,
      location: saved.locations[0] ?? '',
      portForwarding: saved.portForwarding,
      forwardedPort: saved.forwardedPort ? String(saved.forwardedPort) : '',
      freePlan: saved.freePlan,
      fields: { ...saved.fields },
    };
  }
  return {
    protocol: defaultProtocol(provider),
    location: '',
    // Port forwarding makes torrents much faster; on by default where it works automatically.
    portForwarding: provider.portForwarding === 'auto',
    forwardedPort: '',
    freePlan: false,
    fields: {},
  };
}

/**
 * VPN setup (SPEC §9.1): pick a provider, follow its guide next to the form, connect, test.
 * Used by wizard step 5 and (later) Settings → VPN.
 */
export function VpnSetup({ onTested }: { onTested?: (result: VpnTestView | null) => void }) {
  const { t } = useTranslation();
  const config = useQuery({ queryKey: VPN_CONFIG_KEY, queryFn: api.vpnConfig });
  const [provider, setProvider] = useState<VpnProvider | null>(null);
  const [picking, setPicking] = useState(false);

  if (config.isPending) return <Loading />;
  if (config.isError) return <ErrorAlert description={t('vpn.error.load')} />;
  const saved = config.data.config;
  const current = provider ?? (saved && !picking ? (getVpnProvider(saved.provider) ?? null) : null);

  if (!current || picking) {
    return (
      <ProviderPicker
        onPick={(p) => {
          setProvider(p);
          setPicking(false);
          onTested?.(saved?.provider === p.id ? saved.lastTest : null);
        }}
      />
    );
  }
  return (
    <ProviderSetup
      key={current.id}
      provider={current}
      saved={saved}
      onChangeProvider={() => setPicking(true)}
      {...(onTested ? { onTested } : {})}
    />
  );
}

function ProviderSetup({
  provider,
  saved,
  onChangeProvider,
  onTested,
}: {
  provider: VpnProvider;
  saved: VpnConfigView | null;
  onChangeProvider: () => void;
  onTested?: (result: VpnTestView | null) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialForm(provider, saved));
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [phase, setPhase] = useState<'edit' | 'connecting' | 'done'>('edit');
  const [result, setResult] = useState<VpnTestView | null>(
    saved?.provider === provider.id ? saved.lastTest : null,
  );
  const [startedAt, setStartedAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  const sameAsSaved = saved?.provider === provider.id && saved.protocol === form.protocol;
  const savedSecrets = sameAsSaved ? saved.savedSecrets : [];
  const { i18n } = useTranslation();
  const issueText = (m: string) => (i18n.exists(m) ? t(m) : t('wizard.error.generic'));

  const status = useQuery({
    queryKey: VPN_STATUS_KEY,
    queryFn: api.vpnStatus,
    enabled: phase === 'connecting',
    refetchInterval: 2000,
  });

  const test = useMutation({
    mutationFn: api.vpnTest,
    onSuccess: (r) => {
      setResult(r);
      setPhase('done');
      onTested?.(r);
      void client.invalidateQueries({ queryKey: VPN_CONFIG_KEY });
    },
    onError: () => setPhase('edit'),
  });

  const save = useMutation({
    mutationFn: api.saveVpnConfig,
    onSuccess: ({ config }) => {
      client.setQueryData(VPN_CONFIG_KEY, { config });
      // A status from before saving must not start the test.
      client.removeQueries({ queryKey: VPN_STATUS_KEY });
      setResult(null);
      onTested?.(null);
      setStartedAt(Date.now());
      setSeconds(0);
      setPhase('connecting');
    },
    onError: (err) => {
      const out: Partial<Record<string, string>> = {};
      if (err instanceof ApiError) {
        for (const issue of err.issues) {
          const key = issue.path.replace(/^fields\./, '');
          out[key] ??= issueText(issue.message);
        }
      }
      if (Object.keys(out).length === 0) out['form'] = t('wizard.error.saveFailed');
      setErrors(out);
    },
  });

  // While connecting: tick the timer; test as soon as the tunnel is up or Gluetun gave up.
  const testStarted = useRef(false);
  useEffect(() => {
    if (phase !== 'connecting') return;
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase, startedAt]);
  useEffect(() => {
    if (phase !== 'connecting') {
      testStarted.current = false;
      return;
    }
    const c = status.data?.connection;
    if ((c === 'connected' || c === 'error' || c === 'unknown') && !testStarted.current) {
      testStarted.current = true;
      test.mutate();
    }
  }, [phase, status.data, test]);

  const protocols = providerProtocols(provider);
  const proto = provider.protocols[form.protocol];
  const locations = providerLocations(provider, form.protocol, {
    portForwardOnly: form.portForwarding,
    freeOnly: form.freePlan,
  });
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const setField = (id: VpnFieldId, value: string) =>
    setForm((f) => ({ ...f, fields: { ...f.fields, [id]: value } }));

  const submit = () => {
    setErrors({});
    save.mutate({
      provider: provider.id,
      protocol: form.protocol,
      locations: form.location && locations.values.includes(form.location) ? [form.location] : [],
      portForwarding: form.portForwarding,
      forwardedPort: form.portForwarding && form.forwardedPort ? Number(form.forwardedPort) : null,
      freePlan: form.freePlan,
      fields: Object.fromEntries((proto?.fields ?? []).map((f) => [f.id, form.fields[f.id] ?? ''])),
    });
  };

  const busy = save.isPending || phase === 'connecting' || test.isPending;
  const guide = (
    <Suspense fallback={<Loading />}>
      <DocView slug={provider.tutorial} onNavigate={() => undefined} />
    </Suspense>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onChangeProvider}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-13 text-white/60 hover:text-white disabled:opacity-40"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t('vpn.changeProvider')}
        </button>
        <h3 className="text-17 font-semibold -tracking-2" data-testid="vpn-provider-name">
          {provider.name}
        </h3>
        {provider.signupUrl && (
          <a
            href={provider.signupUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-auto inline-flex items-center gap-1 text-13 text-white/55 hover:text-white"
          >
            {t('vpn.noAccount')}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Guide: next to the form on large screens, collapsible on phones. */}
        <aside>
          <button
            type="button"
            className="mb-2 inline-flex items-center gap-1.5 text-13 font-medium text-white/70 hover:text-white lg:hidden"
            onClick={() => setShowGuide((s) => !s)}
            aria-expanded={showGuide}
          >
            <BookOpen className="size-4" aria-hidden />
            {t(showGuide ? 'vpn.guide.hide' : 'vpn.guide.show', { provider: provider.name })}
          </button>
          <div
            className={cn(
              'max-h-[60vh] overflow-y-auto rounded-16 border border-white/8 bg-black/15 p-4 lg:block',
              !showGuide && 'hidden',
            )}
            data-testid="vpn-guide"
          >
            {guide}
          </div>
        </aside>

        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {protocols.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <span className="px-[5px] text-13 font-medium text-white/70">
                {t('vpn.protocol.label')}
              </span>
              <SegmentedControl
                value={form.protocol}
                onValueChange={(p) => set({ protocol: p })}
                ariaLabel={t('vpn.protocol.label')}
                tabs={protocols.map((p) => ({
                  id: p,
                  label:
                    p === 'wireguard'
                      ? `${t('vpn.protocol.wireguard')} · ${t('vpn.protocol.recommended')}`
                      : t('vpn.protocol.openvpn'),
                }))}
              />
            </div>
          )}

          {proto?.fields.map((ref) => (
            <VpnField
              key={`${form.protocol}-${ref.id}`}
              id={ref.id}
              required={ref.required}
              saved={savedSecrets.includes(ref.id)}
              value={form.fields[ref.id] ?? ''}
              onChange={(v) => setField(ref.id, v)}
              error={errors[ref.id]}
            />
          ))}

          {provider.freePlan && (
            <label className="flex items-start gap-2.5 text-14 text-white/80">
              <Checkbox
                checked={form.freePlan}
                onCheckedChange={(v) =>
                  set({ freePlan: v === true, ...(v === true ? { portForwarding: false } : {}) })
                }
                className="mt-0.5"
              />
              <span>
                {t('vpn.freePlan.label')}
                <span className="block text-12 text-white/50">{t('vpn.freePlan.hint')}</span>
              </span>
            </label>
          )}

          {provider.portForwarding !== 'none' && !form.freePlan && (
            <div className="flex flex-col gap-2 rounded-12 border border-white/8 bg-white/4 p-3">
              <label className="flex items-center justify-between gap-3 text-14 font-medium">
                {t('vpn.pf.label')}
                <Switch
                  checked={form.portForwarding}
                  onCheckedChange={(v) => set({ portForwarding: v })}
                  aria-label={t('vpn.pf.label')}
                />
              </label>
              <p className="text-12 leading-relaxed text-white/55">
                {t(provider.portForwarding === 'auto' ? 'vpn.pf.autoHint' : 'vpn.pf.staticHint')}
              </p>
              {form.portForwarding && provider.portForwarding === 'static' && (
                <Field
                  label={t('vpn.pf.port')}
                  inputMode="numeric"
                  value={form.forwardedPort}
                  onChange={(e) => set({ forwardedPort: e.target.value.replace(/\D/g, '') })}
                  error={errors['forwardedPort']}
                />
              )}
              {errors['portForwarding'] && (
                <p className="text-13 text-destructive2-lightest">{errors['portForwarding']}</p>
              )}
            </div>
          )}

          {locations.env && locations.values.length > 0 && (
            <LocationSelect
              env={locations.env}
              values={locations.values}
              value={form.location}
              onChange={(location) => set({ location })}
              error={errors['locations']}
            />
          )}

          {errors['form'] && <ErrorAlert description={errors['form']} />}

          <Button type="submit" variant="primary" size="md" disabled={busy} className="self-start">
            <Plug className="size-3.5" aria-hidden />
            {save.isPending ? t('wizard.saving') : t('vpn.connect')}
          </Button>
        </form>
      </div>

      <div aria-live="polite">
        {phase === 'connecting' && !test.isPending && (
          <VpnConnecting status={status.data} seconds={seconds} />
        )}
        {test.isPending && <Loading>{t('vpn.testing')}</Loading>}
        {test.isError && <ErrorAlert description={t('vpn.error.test')} />}
        {result && phase !== 'connecting' && !test.isPending && (
          <div className="flex flex-col gap-2">
            <VpnTestResult result={result} providerName={provider.name} />
            <Button
              size="sm"
              className="self-start"
              onClick={() => {
                client.removeQueries({ queryKey: VPN_STATUS_KEY });
                setStartedAt(Date.now());
                setPhase('connecting');
              }}
            >
              {t('vpn.testAgain')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function LocationSelect({
  env,
  values,
  value,
  onChange,
  error,
}: {
  env: string;
  values: readonly string[];
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
}) {
  const { t } = useTranslation();
  const id = useId();
  const kind = env === 'SERVER_REGIONS' ? 'region' : env === 'SERVER_CITIES' ? 'city' : 'country';
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="px-[5px] text-13 font-medium text-white/70">
        {t(`vpn.location.${kind}`)}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-full border border-white/10 bg-white/4 px-5 text-15 text-white/90 hover:bg-white/6 focus-visible:border-white/50 focus-visible:outline-hidden [&>option]:bg-neutral-900"
      >
        <option value="">{t('vpn.location.any')}</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      {error && <p className="px-[5px] text-13 text-destructive2-lightest">{error}</p>}
    </div>
  );
}

function VpnField({
  id,
  required,
  saved,
  value,
  onChange,
  error,
}: {
  id: VpnFieldId;
  required: boolean;
  saved: boolean;
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
}) {
  const { t } = useTranslation();
  const def = VPN_FIELDS[id];
  const fieldId = useId();
  const label = `${t(`vpn.field.${id}.label`)}${required ? '' : ` ${t('vpn.field.optional')}`}`;
  const hint = saved ? t('vpn.field.saved') : t(`vpn.field.${id}.hint`);

  if (def.kind === 'multiline' || def.kind === 'file') {
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="px-[5px] text-13 font-medium text-white/70">
          {label}
        </label>
        <textarea
          id={fieldId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={def.kind === 'file' ? 8 : 5}
          spellCheck={false}
          autoComplete="off"
          placeholder={saved ? t('vpn.field.savedPlaceholder') : ''}
          aria-invalid={error ? true : undefined}
          className={cn(
            'rounded-16 border border-white/10 bg-white/4 px-4 py-3 font-mono text-12 text-white/90 placeholder:text-white/30 focus-visible:border-white/50 focus-visible:outline-hidden',
            error && 'border-destructive2-lightest',
          )}
        />
        {def.kind === 'file' && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 self-start px-[5px] text-13 text-white/70 hover:text-white">
            <FileUp className="size-4" aria-hidden />
            {t('vpn.field.chooseFile')}
            <Input
              type="file"
              accept={id === 'wgConfig' ? '.conf,text/plain' : '.ovpn,.conf,text/plain'}
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file && file.size < 200_000) onChange(await file.text());
              }}
            />
          </label>
        )}
        <p className="px-[5px] text-12 text-white/50">{hint}</p>
        {error && (
          <p role="alert" className="px-[5px] text-13 text-destructive2-lightest">
            {error}
          </p>
        )}
      </div>
    );
  }
  return (
    <Field
      label={label}
      type={def.kind === 'secret' ? 'password' : 'text'}
      autoComplete="off"
      autoCapitalize="none"
      spellCheck={false}
      value={value}
      placeholder={saved ? t('vpn.field.savedPlaceholder') : ''}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      hint={hint}
    />
  );
}
