import {
  APP_NAME,
  ISSUES_URL,
  RECHECK_DEFAULT_HOURS,
  RECHECK_HOURS,
  REPO_URL,
  WIZARD_STEPS,
  type WizardStepId,
  type WizardView,
} from '@easyarr/shared';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SelectField } from '~/components/select-field';
import {
  ArrowLeft,
  CircleCheckBig,
  Download,
  Info,
  Library,
  Newspaper,
  RotateCcw,
  Save,
  Shield,
  User,
  Wrench,
  Archive,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, NavLink, useNavigate, useParams } from 'react-router';
import { GlassPanel } from '~/components/glass-panel';
import { WhatsThis } from '~/features/docs/whats-this';
import { useWiringRun, WiringChecklist } from '~/features/wiring/checklist';
import { STEP_UI } from '~/features/wizard/steps';
import { SAVE_MUTATION_KEY, useSaveStep, useWizard } from '~/features/wizard/wizard-api';
import { api } from '~/lib/api';
import { ErrorAlert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { cn } from '@/lib/utils';

const FORM_ID = 'settings-form';

/** Settings sections (SPEC §12). Wizard-backed ones reuse the step's form unchanged. */
const SECTIONS = [
  { id: 'download', step: 'download', icon: Download },
  { id: 'vpn', step: 'vpn', icon: Shield },
  { id: 'usenet', step: 'usenet', icon: Newspaper },
  { id: 'library', step: 'library', icon: Library },
  { id: 'account', step: null, icon: User },
  { id: 'backups', step: null, icon: Archive },
  { id: 'advanced', step: null, icon: Wrench },
  { id: 'about', step: null, icon: Info },
] as const satisfies readonly {
  id: string;
  step: WizardStepId | null;
  icon: typeof Download;
}[];
type SectionId = (typeof SECTIONS)[number]['id'];

function visibleSections(view: WizardView) {
  return SECTIONS.filter((s) => {
    if (!s.step) return true;
    const def = WIZARD_STEPS.find((d) => d.id === s.step);
    return def ? def.isVisible(view.answers) : false;
  });
}

/** /settings and /settings/:section. */
export function SettingsPage() {
  const { t } = useTranslation();
  const { section } = useParams();
  const wizard = useWizard();
  if (wizard.isPending) return <Loading />;
  if (wizard.isError) {
    return (
      <GlassPanel className="flex flex-col items-start gap-3">
        <ErrorAlert description={t('wizard.error.loadFailed')} />
        <Button size="md" onClick={() => void wizard.refetch()}>
          {t('wizard.retry')}
        </Button>
      </GlassPanel>
    );
  }
  const view = wizard.data;
  const sections = visibleSections(view);
  const current = sections.find((s) => s.id === section);
  if (section && !current) return <Navigate to="/settings" replace />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link
          to={current ? '/settings' : '/'}
          className={cn(buttonVariants({ size: 'md' }))}
          aria-label={t(current ? 'settings.backToSettings' : 'settings.backHome')}
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {t(current ? 'settings.title' : 'settings.home')}
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[14rem_1fr]">
        <nav
          aria-label={t('settings.title')}
          className={cn('flex flex-col gap-1', current && 'hidden md:flex')}
        >
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <NavLink
                key={s.id}
                to={`/settings/${s.id}`}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-12 px-3 py-2.5 text-14 font-medium text-white/75 transition-colors hover:bg-white/6',
                    isActive && 'bg-white/10 text-white',
                  )
                }
              >
                <Icon className="size-4 text-white/60" aria-hidden />
                {t(`settings.section.${s.id}`)}
              </NavLink>
            );
          })}
        </nav>
        <div className={cn(!current && 'hidden md:block')}>
          {current ? (
            <Section key={current.id} id={current.id} step={current.step} view={view} />
          ) : (
            <GlassPanel>
              <p className="text-14 text-white/65">{t('settings.pick')}</p>
            </GlassPanel>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  step,
  view,
}: {
  id: SectionId;
  step: WizardStepId | null;
  view: WizardView;
}) {
  const { t } = useTranslation();
  if (step) return <StepSection step={step} view={view} />;
  return (
    <GlassPanel className="flex flex-col gap-4">
      <h2 className="text-20 font-bold -tracking-3">{t(`settings.section.${id}`)}</h2>
      {id === 'account' && <AccountInfo view={view} />}
      {id === 'backups' && <p className="text-14 text-white/65">{t('settings.backups.soon')}</p>}
      {id === 'advanced' && <Advanced />}
      {id === 'about' && <About />}
    </GlassPanel>
  );
}

type Phase = 'edit' | 'applying' | 'done' | 'failed';

/**
 * A wizard step's form, saved with "Save". A saved change re-opens the wizard's Finish step
 * (D-053), so the section applies it right away: the wiring runs with the live checklist and the
 * setup is marked finished again. If the change needs a new step first (e.g. Usenet after
 * switching the download method), the wizard continues there.
 */
function StepSection({ step, view }: { step: WizardStepId; view: WizardView }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ui = STEP_UI[step];
  const { Form } = ui;
  const saving = useIsMutating({ mutationKey: SAVE_MUTATION_KEY }) > 0;
  const run = useWiringRun();
  const finish = useSaveStep('finish');
  const [phase, setPhase] = useState<Phase>('edit');

  const apply = async (next: WizardView) => {
    if (next.next && next.next !== 'finish') {
      void navigate(`/setup/${next.next}`);
      return;
    }
    setPhase('applying');
    const end = await run.start('run');
    const ok = end?.ok === true;
    // A run happened either way; "problems" keeps the dashboard's warning until a repair works.
    finish.mutate({ result: ok ? 'ok' : 'problems' });
    setPhase(ok ? 'done' : 'failed');
  };

  return (
    <GlassPanel className="flex flex-col gap-5" data-testid={`settings-${step}`}>
      <header className="flex flex-col gap-1.5">
        <h2 className="text-20 font-bold -tracking-3">{t(ui.title)}</h2>
        <p className="max-w-2xl text-14 leading-relaxed text-white/65">{t(ui.intro)}</p>
        {ui.doc && <WhatsThis slug={ui.doc} className="self-start" />}
      </header>

      {phase === 'edit' ? (
        <>
          <Form formId={FORM_ID} view={view} onSaved={(next) => void apply(next)} />
          <footer className="flex border-t border-white/8 pt-5">
            <Button
              type="submit"
              form={FORM_ID}
              variant="primary"
              size="md"
              disabled={saving}
              className="w-full sm:ml-auto sm:w-auto"
            >
              <Save className="size-3.5" aria-hidden />
              {saving ? t('wizard.saving') : t('settings.save')}
            </Button>
          </footer>
        </>
      ) : (
        <div className="flex flex-col gap-4" data-testid="settings-apply" data-phase={phase}>
          <p className="flex items-start gap-2 text-14 text-white/80" role="status">
            {phase === 'done' && (
              <CircleCheckBig className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden />
            )}
            {phase === 'failed' && (
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
            )}
            {t(`settings.apply.${phase}`)}
          </p>
          {run.rows.length > 0 && (
            <div className="rounded-15 border border-white/8 bg-black/15 px-4 py-1">
              <WiringChecklist rows={run.rows} />
            </div>
          )}
          {phase !== 'applying' && (
            <div className="flex flex-wrap gap-2">
              <Button size="md" onClick={() => setPhase('edit')}>
                {t('settings.apply.again')}
              </Button>
              <Link to="/" className={cn(buttonVariants({ size: 'md' }))}>
                {t('settings.home')}
              </Link>
            </div>
          )}
        </div>
      )}
    </GlassPanel>
  );
}

/**
 * Read-only for now: Jellyfin and the request page only take the account on the first run, so a
 * new password here would not reach them (D-060).
 */
function AccountInfo({ view }: { view: WizardView }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-14">
        <span className="text-white/55">{t('account.username')}: </span>
        <span className="font-medium">{view.account?.username ?? '—'}</span>
      </p>
      <p className="text-14 leading-relaxed text-white/65">{t('settings.account.body')}</p>
      <WhatsThis slug="family-accounts" className="self-start" />
    </div>
  );
}

function Advanced() {
  const { t } = useTranslation();
  const run = useWiringRun();
  const status = useQuery({ queryKey: ['wiring'], queryFn: api.wiring });
  const start = async (mode: 'run' | 'repair') => {
    await run.start(mode);
    void status.refetch();
  };
  const last = status.data?.lastRun;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-14 leading-relaxed text-white/65">{t('settings.advanced.body')}</p>
      {last && (
        <p className="text-13 text-white/55" data-testid="last-run">
          {t(last.ok ? 'settings.advanced.lastOk' : 'settings.advanced.lastProblems', {
            when: new Date(last.at).toLocaleString(),
          })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="md" disabled={run.busy} onClick={() => void start('run')}>
          <RotateCcw className="size-3.5" aria-hidden />
          {t('settings.advanced.rerun')}
        </Button>
        <Button size="md" disabled={run.busy} onClick={() => void start('repair')}>
          <Wrench className="size-3.5" aria-hidden />
          {t('settings.advanced.repair')}
        </Button>
      </div>
      <p className="text-12 text-white/45">{t('settings.advanced.repairHint')}</p>
      {run.error && (
        <ErrorAlert
          description={t(`wiring.error.${run.error}`, { defaultValue: t('wiring.error.generic') })}
        />
      )}
      {run.rows.length > 0 && (
        <div className="rounded-15 border border-white/8 bg-black/15 px-4 py-1">
          <WiringChecklist rows={run.rows} />
        </div>
      )}
      <RecheckSetting />
    </div>
  );
}

/** How often EasyArr searches again for requests that never started downloading (D-067). */
function RecheckSetting() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const current = useQuery({ queryKey: ['recheck'], queryFn: api.recheck });
  const save = useMutation({
    mutationFn: (hours: number) => api.setRecheck(hours),
    onSuccess: (data) => client.setQueryData(['recheck'], data),
  });
  return (
    <div className="flex flex-col gap-2 border-t border-white/8 pt-4" data-testid="recheck">
      <SelectField
        label={t('settings.recheck.label')}
        value={String(current.data?.hours ?? RECHECK_DEFAULT_HOURS)}
        disabled={current.isPending || save.isPending}
        className="md:max-w-sm"
        onChange={(e) => save.mutate(Number(e.target.value))}
        hint={t('settings.recheck.hint')}
      >
        {RECHECK_HOURS.map((h) => (
          <option key={h} value={h}>
            {h === 0 ? t('settings.recheck.off') : t('settings.recheck.every', { count: h })}
          </option>
        ))}
      </SelectField>
      {save.isSuccess && <p className="text-12 text-emerald-300">{t('settings.recheck.saved')}</p>}
      {save.isError && <ErrorAlert description={t('settings.recheck.failed')} />}
    </div>
  );
}

function About() {
  const { t } = useTranslation();
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000 });
  const status = useQuery({ queryKey: ['status'], queryFn: api.status, staleTime: 30_000 });
  const version = status.data?.version ?? health.data?.version;
  const links = [
    { href: '/help', label: t('settings.about.help'), internal: true },
    { href: REPO_URL, label: t('settings.about.source') },
    { href: ISSUES_URL, label: t('settings.about.issues') },
    { href: '/licenses/NOTICE.md', label: t('footer.licenses') },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-14">
        {APP_NAME} {version ? t('footer.version', { version }) : ''}
      </p>
      <p className="text-14 leading-relaxed text-white/65">{t('settings.about.body')}</p>
      <ul className="flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.href}>
            {l.internal ? (
              <Link to={l.href} className={cn(buttonVariants({ size: 'sm' }))}>
                {l.label}
              </Link>
            ) : (
              <a
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ size: 'sm' }))}
              >
                {l.label}
              </a>
            )}
          </li>
        ))}
      </ul>
      <p className="text-12 text-white/45">{t('footer.notAffiliated')}</p>
    </div>
  );
}
