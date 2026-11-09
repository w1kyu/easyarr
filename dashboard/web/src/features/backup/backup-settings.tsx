import type { BackupFileView, BackupSettings, BackupSettingsView } from '@easyarr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FolderOpen, History, Lock, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Field } from '~/components/field';
import { SelectField } from '~/components/select-field';
import { WhatsThis } from '~/features/docs/whats-this';
import { ApiError, backupApi } from '~/lib/api';
import { ErrorAlert, InfoAlert } from '@/components/ui/alert';
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
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export const BACKUP_KEY = ['backup'] as const;
const KEEP_CHOICES = [3, 5, 7, 14, 30];
const MIN_PASSWORD = 8;

export function formatSize(bytes: number, lang: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: i ? 1 : 0 }).format(v)} ${units[i]}`;
}

export function formatDate(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** Settings → Backups (SPEC §11): download, automatic backups, restore. */
export function BackupSettings() {
  const { t } = useTranslation();
  const view = useQuery({ queryKey: BACKUP_KEY, queryFn: backupApi.view });
  return (
    <div className="flex flex-col gap-5" data-testid="backup-settings">
      <p className="max-w-2xl text-14 leading-relaxed text-white/65">
        {t('backup.intro')} <WhatsThis slug="backup-restore" />
      </p>
      <DownloadBackup />
      {view.isError && <ErrorAlert description={t('backup.loadFailed')} />}
      {view.data && <AutomaticBackups view={view.data} />}
      <div className="flex flex-col gap-2 border-t border-white/8 pt-4">
        <h3 className="text-15 font-semibold">{t('backup.restore.title')}</h3>
        <p className="max-w-2xl text-13 leading-relaxed text-white/60">
          {t('backup.restore.intro')}
        </p>
        <Link to="/restore" className={cn(buttonVariants({ size: 'md' }), 'self-start')}>
          <History className="size-3.5" aria-hidden />
          {t('backup.restore.fromFile')}
        </Link>
      </div>
    </div>
  );
}

function DownloadBackup() {
  const { t } = useTranslation();
  const [encrypt, setEncrypt] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const download = useMutation({ mutationFn: (pw?: string) => backupApi.download(pw) });
  const check = encrypt && touched;
  const shortError =
    check && password.length < MIN_PASSWORD
      ? t('backup.download.passwordShort', { count: MIN_PASSWORD })
      : undefined;
  const mismatchError =
    check && !shortError && password !== confirm
      ? t('backup.download.passwordMismatch')
      : undefined;
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="backup-download"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (encrypt && (password.length < MIN_PASSWORD || password !== confirm)) return;
        download.mutate(encrypt ? password : undefined);
      }}
    >
      <h3 className="text-15 font-semibold">{t('backup.download.title')}</h3>
      <label className="flex cursor-pointer items-center justify-between gap-4 md:max-w-xl">
        <span className="flex items-center gap-2 text-14 font-medium">
          <Lock className="size-4 text-white/60" aria-hidden />
          {t('backup.download.encrypt')}
        </span>
        <Switch
          checked={encrypt}
          onCheckedChange={setEncrypt}
          aria-label={t('backup.download.encrypt')}
        />
      </label>
      <p className="text-12 leading-relaxed text-white/50 md:max-w-xl">
        {t(encrypt ? 'backup.download.encryptHint' : 'backup.download.plainHint')}
      </p>
      {encrypt && (
        <div className="grid gap-3 md:max-w-xl md:grid-cols-2">
          <Field
            label={t('backup.download.password')}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={shortError}
          />
          <Field
            label={t('backup.download.confirm')}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={mismatchError}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="md" disabled={download.isPending}>
          <Download className="size-3.5" aria-hidden />
          {t(download.isPending ? 'backup.download.working' : 'backup.download.button')}
        </Button>
        {download.isPending && (
          <span className="text-12 text-white/50">{t('backup.download.slow')}</span>
        )}
        {download.isSuccess && (
          <span className="text-12 text-emerald-300">{t('backup.download.done')}</span>
        )}
      </div>
      {download.isError && (
        <ErrorAlert
          description={t(`backup.error.${errorCode(download.error)}`, {
            defaultValue: t('backup.error.generic'),
          })}
        />
      )}
    </form>
  );
}

const errorCode = (err: unknown) => (err instanceof ApiError ? err.code : 'generic');

function AutomaticBackups({ view }: { view: BackupSettingsView }) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: backupApi.saveSettings,
    onSuccess: (data) => client.setQueryData(BACKUP_KEY, data),
  });
  const update = (patch: Partial<Omit<BackupSettings, 'timeZone'>>) =>
    save.mutate({
      enabled: view.enabled,
      hour: view.hour,
      minute: view.minute,
      keep: view.keep,
      ...patch,
      // The time means "your" 04:00: the browser's time zone is saved with every change.
      timeZone: browserTimeZone(),
    });
  const time = (h: number, m: number) =>
    new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' }).format(
      new Date(2000, 0, 1, h, m),
    );
  return (
    <div className="flex flex-col gap-3 border-t border-white/8 pt-4" data-testid="backup-auto">
      <h3 className="text-15 font-semibold">{t('backup.auto.title')}</h3>
      <label className="flex cursor-pointer items-center justify-between gap-4 md:max-w-xl">
        <span className="text-14 font-medium">{t('backup.auto.enabled')}</span>
        <Switch
          checked={view.enabled}
          disabled={save.isPending}
          onCheckedChange={(enabled) => update({ enabled })}
          aria-label={t('backup.auto.enabled')}
        />
      </label>
      {view.enabled && (
        <div className="grid gap-3 md:max-w-xl md:grid-cols-2">
          <SelectField
            label={t('backup.auto.time')}
            value={view.hour}
            disabled={save.isPending}
            onChange={(e) => update({ hour: Number(e.target.value), minute: 0 })}
            hint={t('backup.auto.timeZone', { zone: view.timeZone })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {time(h, 0)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('backup.auto.keep')}
            value={view.keep}
            disabled={save.isPending}
            onChange={(e) => update({ keep: Number(e.target.value) })}
          >
            {[...new Set([...KEEP_CHOICES, view.keep])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {t('backup.auto.keepN', { count: n })}
                </option>
              ))}
          </SelectField>
        </div>
      )}
      <InfoAlert
        icon={FolderOpen}
        description={t('backup.auto.whereNote')}
        className="md:max-w-xl"
      />
      {view.lastAuto && !view.lastAuto.ok && (
        <ErrorAlert
          description={t('backup.auto.lastFailed', {
            date: formatDate(view.lastAuto.at, i18n.language),
            error: view.lastAuto.error ?? '',
          })}
        />
      )}
      {save.isError && <ErrorAlert description={t('backup.auto.saveFailed')} />}
      <FileList files={view.files} />
    </div>
  );
}

function FileList({ files }: { files: BackupFileView[] }) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const [toDelete, setToDelete] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: backupApi.deleteFile,
    onSettled: () => void client.invalidateQueries({ queryKey: BACKUP_KEY }),
  });
  if (files.length === 0) {
    return <p className="text-13 text-white/50">{t('backup.files.none')}</p>;
  }
  return (
    <>
      <ul className="flex flex-col divide-y divide-white/10" data-testid="backup-files">
        {files.map((f) => (
          <li key={f.name} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-14">{formatDate(f.createdAt, i18n.language)}</span>
              <span className="truncate text-12 text-white/45">
                {formatSize(f.size, i18n.language)} · {f.name}
              </span>
            </div>
            <a
              href={backupApi.fileUrl(f.name)}
              download={f.name}
              className={cn(buttonVariants({ size: 'sm' }))}
              aria-label={t('backup.files.downloadOne', { name: f.name })}
            >
              <Download className="size-3.5" aria-hidden />
              {t('backup.files.download')}
            </a>
            <Link
              to={`/restore?file=${encodeURIComponent(f.name)}`}
              className={cn(buttonVariants({ size: 'sm' }))}
              aria-label={t('backup.files.restoreOne', { name: f.name })}
            >
              <History className="size-3.5" aria-hidden />
              {t('backup.files.restore')}
            </Link>
            <Button
              size="sm"
              onClick={() => setToDelete(f.name)}
              aria-label={t('backup.files.deleteOne', { name: f.name })}
            >
              <Trash2 className="size-3.5" aria-hidden />
              {t('backup.files.delete')}
            </Button>
          </li>
        ))}
      </ul>
      {remove.isError && <ErrorAlert description={t('backup.files.deleteFailed')} />}
      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('backup.files.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('backup.files.deleteBody', { name: toDelete ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (toDelete) remove.mutate(toDelete);
                setToDelete(null);
              }}
            >
              {t('backup.files.deleteConfirm')}
            </AlertDialogAction>
            <AlertDialogCancel>{t('backup.files.cancel')}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
