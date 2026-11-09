import type { WizardStepId, WizardView } from '@easyarr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError, type ApiIssue } from '~/lib/api';

export const WIZARD_QUERY_KEY = ['wizard'] as const;
export const SAVE_MUTATION_KEY = ['wizard-save'] as const;

export function useWizard() {
  return useQuery({ queryKey: WIZARD_QUERY_KEY, queryFn: api.wizard, staleTime: 5_000 });
}

/**
 * The passwords/API keys saved earlier, so reopened forms show them masked (D-064). Kept only in
 * memory for the open form (no cache after it unmounts).
 */
export function useSavedSecrets(enabled: boolean) {
  return useQuery({
    queryKey: ['wizard-secrets'],
    queryFn: api.savedSecrets,
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

/** Saves one step's answers and refreshes the cached wizard state. */
export function useSaveStep(step: WizardStepId) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: (body: unknown) => api.saveWizardStep(step, body),
    onSuccess: (view) => client.setQueryData<WizardView>(WIZARD_QUERY_KEY, view),
  });
}

/** Field errors keyed by field name, translated. Unknown messages fall back to a generic text. */
export type FieldErrors = Partial<Record<string, string>>;

export function useIssueText() {
  const { t, i18n } = useTranslation();
  return (message: string) => (i18n.exists(message) ? t(message) : t('wizard.error.generic'));
}

export function issuesToFieldErrors(
  issues: readonly ApiIssue[],
  text: (message: string) => string,
): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of issues) {
    const field = issue.path.split('.')[0] || 'form';
    out[field] ??= text(issue.message);
  }
  return out;
}

/** A user-facing message for a failed save that has no field-level issues. */
export function useSaveErrorText() {
  const { t } = useTranslation();
  return (err: unknown) =>
    err instanceof ApiError && err.status === 0
      ? t('wizard.error.network')
      : err instanceof ApiError && err.code === 'previous_steps_incomplete'
        ? t('wizard.error.previousSteps')
        : t('wizard.error.saveFailed');
}

/** Props every step form gets. Steps are plain forms so Settings can reuse them later (SPEC §12). */
export interface StepFormProps {
  /** The `id` of the <form>; the wizard's Next button submits it via `form={formId}`. */
  formId: string;
  view: WizardView;
  onSaved: (view: WizardView) => void;
}
