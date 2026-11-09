import {
  MAX_USENET_INDEXERS,
  MAX_USENET_SERVERS,
  USENET_INDEXER_PRESETS,
  USENET_PROVIDER_PRESETS,
  usenetIndexerPreset,
  usenetInputSchema,
  usenetProviderPreset,
  type UsenetTestResult,
} from '@easyarr/shared';
import { useMutation } from '@tanstack/react-query';
import {
  CircleCheck,
  CircleX,
  ExternalLink,
  Library,
  PlugZap,
  Plus,
  Server,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '~/components/field';
import { SelectField } from '~/components/select-field';
import { api, ApiError } from '~/lib/api';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  useIssueText,
  useSaveErrorText,
  useSaveStep,
  type FieldErrors,
  type StepFormProps,
} from '../wizard-api';

interface ServerForm {
  id: string;
  preset: string | null;
  host: string;
  port: string;
  ssl: boolean;
  username: string;
  password: string;
  connections: string;
}

interface IndexerForm {
  id: string;
  preset: string | null;
  name: string;
  url: string;
  apiPath: string;
  apiKey: string;
}

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const emptyServer = (): ServerForm => ({
  id: newId('s'),
  preset: null,
  host: '',
  port: '563',
  ssl: true,
  username: '',
  password: '',
  connections: '20',
});

const emptyIndexer = (): IndexerForm => ({
  id: newId('i'),
  preset: null,
  name: '',
  url: '',
  apiPath: '/api',
  apiKey: '',
});

/** "563" → 563; anything else → NaN, so the shared schema reports it. */
const num = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : Number.NaN);

const serverBody = (s: ServerForm) => ({
  id: s.id,
  preset: s.preset,
  host: s.host.trim(),
  port: num(s.port),
  ssl: s.ssl,
  username: s.username.trim(),
  connections: num(s.connections),
  ...(s.password ? { password: s.password } : {}),
});

const indexerBody = (x: IndexerForm) => ({
  id: x.id,
  preset: x.preset,
  name: x.name.trim(),
  url: x.url.trim(),
  apiPath: x.apiPath,
  ...(x.apiKey ? { apiKey: x.apiKey } : {}),
});

/**
 * Step 6 (Usenet, SPEC §8): explains provider vs indexer, then one form per provider and indexer.
 * Presets fill in the address; "Test" asks SABnzbd/Prowlarr to try it, through the VPN like a
 * real download. Passwords/API keys are only sent, never read back.
 */
export function UsenetStep({ formId, view, onSaved }: StepFormProps) {
  const { t } = useTranslation();
  const save = useSaveStep('usenet');
  const issueText = useIssueText();
  const errorText = useSaveErrorText();
  const saved = view.answers.usenet;
  const savedSecrets = view.usenetSecrets;
  const [servers, setServers] = useState<ServerForm[]>(
    saved?.servers.map((s) => ({
      ...s,
      port: String(s.port),
      connections: String(s.connections),
      password: '',
    })) ?? [emptyServer()],
  );
  const [indexers, setIndexers] = useState<IndexerForm[]>(
    saved?.indexers.map((x) => ({ ...x, apiKey: '' })) ?? [emptyIndexer()],
  );
  const [errors, setErrors] = useState<FieldErrors>({});

  const toErrors = (issues: { path: string; message: string }[]) => {
    const out: FieldErrors = {};
    for (const i of issues) out[i.path || 'form'] ??= issueText(i.message);
    return out;
  };

  const submit = () => {
    const body = { servers: servers.map(serverBody), indexers: indexers.map(indexerBody) };
    const parsed = usenetInputSchema.safeParse(body);
    const next: FieldErrors = parsed.success
      ? {}
      : toErrors(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    servers.forEach((s, i) => {
      if (!s.password && !savedSecrets.servers.includes(s.id))
        next[`servers.${i}.password`] ??= t('wizard.error.usenetPasswordRequired');
    });
    indexers.forEach((x, i) => {
      if (!x.apiKey && !savedSecrets.indexers.includes(x.id))
        next[`indexers.${i}.apiKey`] ??= t('wizard.error.indexerApiKeyRequired');
    });
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.success) return;
    save.mutate(parsed.data, {
      onSuccess: onSaved,
      onError: (err) => {
        if (err instanceof ApiError) setErrors(toErrors(err.issues));
      },
    });
  };

  return (
    <form
      id={formId}
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="usenet-explainer">
        <Explainer
          icon={Server}
          title={t('usenet.explain.providerTitle')}
          body={t('usenet.explain.provider')}
        />
        <Explainer
          icon={Library}
          title={t('usenet.explain.indexerTitle')}
          body={t('usenet.explain.indexer')}
        />
      </div>

      <section aria-labelledby="usenet-servers" className="flex flex-col gap-3">
        <h3 id="usenet-servers" className="text-17 font-semibold -tracking-2">
          {t('usenet.servers.title')}
        </h3>
        <p className="text-13 leading-relaxed text-white/60">{t('usenet.servers.intro')}</p>
        {servers.map((s, i) => (
          <ServerCard
            key={s.id}
            index={i}
            server={s}
            hasSaved={savedSecrets.servers.includes(s.id)}
            errors={errors}
            onChange={(patch) =>
              setServers((list) => list.map((x) => (x.id === s.id ? { ...x, ...patch } : x)))
            }
            onRemove={
              servers.length > 1
                ? () => setServers((list) => list.filter((x) => x.id !== s.id))
                : undefined
            }
          />
        ))}
        {servers.length < MAX_USENET_SERVERS && (
          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={() => setServers((list) => [...list, emptyServer()])}
          >
            <Plus className="size-3.5" aria-hidden /> {t('usenet.servers.add')}
          </Button>
        )}
      </section>

      <section aria-labelledby="usenet-indexers" className="flex flex-col gap-3">
        <h3 id="usenet-indexers" className="text-17 font-semibold -tracking-2">
          {t('usenet.indexers.title')}
        </h3>
        <p className="text-13 leading-relaxed text-white/60">{t('usenet.indexers.intro')}</p>
        {indexers.map((x, i) => (
          <IndexerCard
            key={x.id}
            index={i}
            indexer={x}
            hasSaved={savedSecrets.indexers.includes(x.id)}
            errors={errors}
            onChange={(patch) =>
              setIndexers((list) => list.map((y) => (y.id === x.id ? { ...y, ...patch } : y)))
            }
            onRemove={
              indexers.length > 1
                ? () => setIndexers((list) => list.filter((y) => y.id !== x.id))
                : undefined
            }
          />
        ))}
        {indexers.length < MAX_USENET_INDEXERS && (
          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={() => setIndexers((list) => [...list, emptyIndexer()])}
          >
            <Plus className="size-3.5" aria-hidden /> {t('usenet.indexers.add')}
          </Button>
        )}
      </section>

      <p className="text-13 text-white/55">{t('usenet.testOptional')}</p>
      {errors['form'] && <ErrorAlert description={errors['form']} />}
      {save.isError && Object.keys(errors).length === 0 && (
        <ErrorAlert description={errorText(save.error)} />
      )}
    </form>
  );
}

function Explainer({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Server;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-12 border border-white/8 bg-white/4 p-3.5">
      <Icon className="mt-0.5 size-5 shrink-0 text-white/70" aria-hidden />
      <div className="flex flex-col gap-1 text-13 leading-relaxed">
        <p className="font-semibold text-white/85">{title}</p>
        <p className="text-white/65">{body}</p>
      </div>
    </div>
  );
}

function Card({
  title,
  onRemove,
  removeLabel,
  children,
  testId,
}: {
  title: string;
  onRemove: (() => void) | undefined;
  removeLabel: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      className="flex flex-col gap-4 rounded-16 border border-white/10 bg-white/4 p-4"
      data-testid={testId}
    >
      <div className="flex items-center gap-2">
        <p className="text-14 font-semibold text-white/85">{title}</p>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto inline-flex items-center gap-1 text-13 text-white/55 hover:text-white"
          >
            <Trash2 className="size-3.5" aria-hidden /> {removeLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ServerCard({
  index,
  server: s,
  hasSaved,
  errors,
  onChange,
  onRemove,
}: {
  index: number;
  server: ServerForm;
  hasSaved: boolean;
  errors: FieldErrors;
  onChange: (patch: Partial<ServerForm>) => void;
  onRemove: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const err = (f: string) => errors[`servers.${index}.${f}`];
  const preset = usenetProviderPreset(s.preset);
  const test = useMutation({
    mutationFn: () => api.testUsenetServer({ ...serverBody(s), id: s.id }),
  });
  return (
    <Card
      title={preset?.name ?? (s.host || t('usenet.servers.newTitle', { n: index + 1 }))}
      onRemove={onRemove}
      removeLabel={t('usenet.remove')}
      testId={`usenet-server-${index}`}
    >
      <SelectField
        label={t('usenet.servers.provider')}
        value={s.preset ?? ''}
        onChange={(e) => {
          const p = usenetProviderPreset(e.target.value || null);
          test.reset();
          onChange(
            p
              ? {
                  preset: p.id,
                  host: p.host,
                  port: String(p.port),
                  ssl: true,
                  connections: String(p.connections),
                }
              : { preset: null },
          );
        }}
        hint={
          preset ? (
            <a
              href={preset.signupUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 hover:text-white"
            >
              {t('usenet.servers.presetHint', { name: preset.name })}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : (
            t('usenet.servers.otherHint')
          )
        }
      >
        <option value="">{t('usenet.servers.other')}</option>
        {USENET_PROVIDER_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem]">
        <Field
          label={t('usenet.servers.host')}
          value={s.host}
          autoCapitalize="none"
          spellCheck={false}
          placeholder="news.example.com"
          onChange={(e) => onChange({ host: e.target.value })}
          error={err('host')}
        />
        <Field
          label={t('usenet.servers.port')}
          value={s.port}
          inputMode="numeric"
          onChange={(e) => onChange({ port: e.target.value })}
          error={err('port')}
        />
      </div>
      <label className="flex items-center gap-2.5 px-[5px] text-13 text-white/75">
        <Checkbox checked={s.ssl} onCheckedChange={(v) => onChange({ ssl: v === true })} />
        {t('usenet.servers.ssl')}
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label={t('usenet.servers.username')}
          value={s.username}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => onChange({ username: e.target.value })}
          error={err('username')}
        />
        <Field
          label={t('usenet.servers.password')}
          type="password"
          autoComplete="new-password"
          value={s.password}
          placeholder={hasSaved ? t('usenet.savedPlaceholder') : undefined}
          onChange={(e) => onChange({ password: e.target.value })}
          error={err('password')}
          hint={hasSaved ? t('usenet.savedHint') : undefined}
        />
      </div>
      <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-[8rem_1fr] sm:items-end">
        <Field
          label={t('usenet.servers.connections')}
          value={s.connections}
          inputMode="numeric"
          onChange={(e) => onChange({ connections: e.target.value })}
          error={err('connections')}
        />
        <p className="px-[5px] pb-1 text-12 leading-relaxed text-white/50 sm:pb-3.5">
          {t('usenet.servers.connectionsHint')}
        </p>
      </div>
      <TestRow
        label={t('usenet.test.server')}
        pending={test.isPending}
        result={test.data}
        failed={test.isError}
        onTest={() => test.mutate()}
      />
    </Card>
  );
}

function IndexerCard({
  index,
  indexer: x,
  hasSaved,
  errors,
  onChange,
  onRemove,
}: {
  index: number;
  indexer: IndexerForm;
  hasSaved: boolean;
  errors: FieldErrors;
  onChange: (patch: Partial<IndexerForm>) => void;
  onRemove: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const err = (f: string) => errors[`indexers.${index}.${f}`];
  const test = useMutation({
    mutationFn: () => api.testUsenetIndexer({ ...indexerBody(x), id: x.id }),
  });
  return (
    <Card
      title={x.name || t('usenet.indexers.newTitle', { n: index + 1 })}
      onRemove={onRemove}
      removeLabel={t('usenet.remove')}
      testId={`usenet-indexer-${index}`}
    >
      <SelectField
        label={t('usenet.indexers.indexer')}
        value={x.preset ?? ''}
        onChange={(e) => {
          const p = usenetIndexerPreset(e.target.value || null);
          test.reset();
          onChange(
            p
              ? { preset: p.id, name: p.name, url: p.url, apiPath: p.apiPath ?? '/api' }
              : { preset: null, apiPath: '/api' },
          );
        }}
        hint={t('usenet.indexers.presetHint')}
      >
        <option value="">{t('usenet.indexers.other')}</option>
        {USENET_INDEXER_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label={t('usenet.indexers.name')}
          value={x.name}
          onChange={(e) => onChange({ name: e.target.value })}
          error={err('name')}
        />
        <Field
          label={t('usenet.indexers.url')}
          value={x.url}
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://indexer.example"
          onChange={(e) => onChange({ url: e.target.value })}
          error={err('url')}
        />
      </div>
      <Field
        label={t('usenet.indexers.apiKey')}
        type="password"
        autoComplete="off"
        value={x.apiKey}
        placeholder={hasSaved ? t('usenet.savedPlaceholder') : undefined}
        onChange={(e) => onChange({ apiKey: e.target.value })}
        error={err('apiKey')}
        hint={hasSaved ? t('usenet.savedHint') : t('usenet.indexers.apiKeyHint')}
      />
      <TestRow
        label={t('usenet.test.indexer')}
        pending={test.isPending}
        result={test.data}
        failed={test.isError}
        onTest={() => test.mutate()}
      />
    </Card>
  );
}

function TestRow({
  label,
  pending,
  result,
  failed,
  onTest,
}: {
  label: string;
  pending: boolean;
  result: UsenetTestResult | undefined;
  failed: boolean;
  onTest: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <Button type="button" size="sm" disabled={pending} onClick={onTest} className="shrink-0">
        <PlugZap className="size-3.5" aria-hidden />
        {pending ? t('usenet.test.testing') : label}
      </Button>
      {!pending && (result || failed) && (
        <div
          role="status"
          data-testid="usenet-test-result"
          data-ok={result?.ok ? 'true' : 'false'}
          className={cn(
            'flex items-start gap-2 text-13 leading-relaxed',
            result?.ok ? 'text-emerald-300' : 'text-amber-200',
          )}
        >
          {result?.ok ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <span>
            {t(`usenet.test.result.${result?.reason ?? 'failed'}`)}
            {result?.detail && !result.ok && (
              <span className="block text-12 text-white/50">{result.detail}</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
