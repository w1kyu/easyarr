import { accountInputSchema } from '@easyarr/shared';
import { Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '~/components/field';
import { PasswordStrengthMeter } from '~/components/password-strength';
import { WhatsThis } from '~/features/docs/whats-this';
import { ApiError } from '~/lib/api';
import { ErrorAlert } from '@/components/ui/alert';
import {
  issuesToFieldErrors,
  useIssueText,
  useSaveErrorText,
  useSaveStep,
  type FieldErrors,
  type StepFormProps,
} from '../wizard-api';

/**
 * Step 3: the owner's account (Jellyfin admin + Jellyseerr login later). The password is only
 * sent to the server, never read back; when one is saved, leaving the fields empty keeps it.
 */
export function AccountStep({ formId, view, onSaved }: StepFormProps) {
  const { t } = useTranslation();
  const save = useSaveStep('account');
  const issueText = useIssueText();
  const errorText = useSaveErrorText();
  const hasPassword = view.account?.hasPassword ?? false;
  const [username, setUsername] = useState(view.account?.username ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = () => {
    const keepPassword = hasPassword && password === '' && confirm === '';
    const body = keepPassword ? { username } : { username, password };
    const parsed = accountInputSchema.safeParse(body);
    const next: FieldErrors = parsed.success
      ? {}
      : issuesToFieldErrors(
          parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          issueText,
        );
    if (!keepPassword && !next['password'] && password !== confirm) {
      next['confirm'] = t('wizard.error.passwordMismatch');
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.success) return;
    save.mutate(parsed.data, {
      onSuccess: (v) => {
        setPassword('');
        setConfirm('');
        onSaved(v);
      },
      onError: (err) => {
        if (err instanceof ApiError) setErrors(issuesToFieldErrors(err.issues, issueText));
      },
    });
  };

  return (
    <form
      id={formId}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field
        label={t('account.username')}
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={errors['username']}
        hint={t('account.usernameHint')}
      />
      <Field
        label={t('account.password')}
        name="new-password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors['password']}
        hint={
          password ? (
            <PasswordStrengthMeter password={password} username={username} />
          ) : (
            t(hasPassword ? 'account.passwordKeep' : 'account.passwordHint')
          )
        }
      />
      <Field
        label={t('account.confirm')}
        name="confirm-password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors['confirm']}
      />
      <div className="flex items-start gap-3 rounded-12 border border-white/8 bg-white/4 p-3.5">
        <Users className="mt-0.5 size-5 shrink-0 text-white/70" aria-hidden />
        <div className="flex flex-col gap-1.5 text-13 leading-relaxed text-white/65">
          <p>{t('account.usedFor')}</p>
          <p>{t('account.family')}</p>
          <WhatsThis
            slug="family-accounts"
            label={t('account.familyLink')}
            className="self-start"
          />
        </div>
      </div>
      {errors['form'] && <ErrorAlert description={errors['form']} />}
      {save.isError && Object.keys(errors).length === 0 && (
        <ErrorAlert description={errorText(save.error)} />
      )}
    </form>
  );
}
