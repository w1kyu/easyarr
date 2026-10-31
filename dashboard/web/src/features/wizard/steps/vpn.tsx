import type { VpnTestView } from '@easyarr/shared';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WhatsThis } from '~/features/docs/whats-this';
import { VPN_CONFIG_KEY, VpnSetup } from '~/features/vpn/vpn-setup';
import { api } from '~/lib/api';
import { ErrorAlert } from '@/components/ui/alert';
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
import { useSaveErrorText, useSaveStep, type StepFormProps } from '../wizard-api';

/**
 * Step 5: connect a VPN and pass the connection test, or skip with an honest warning (SPEC §8, §9).
 * Skipping keeps the kill switch closed, so nothing leaks — downloads just don't work yet.
 */
export function VpnStep({ formId, onSaved }: StepFormProps) {
  const { t } = useTranslation();
  const save = useSaveStep('vpn');
  const errorText = useSaveErrorText();
  const config = useQuery({ queryKey: VPN_CONFIG_KEY, queryFn: api.vpnConfig });
  // undefined = nothing tested in this visit yet → fall back to the saved test result.
  const [tested, setTested] = useState<VpnTestView | null | undefined>(undefined);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const last = tested === undefined ? (config.data?.config?.lastTest ?? null) : tested;
  const passed = last?.ok === true;

  return (
    <>
      <VpnSetup onTested={setTested} />
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          if (passed) save.mutate({ mode: 'configured' }, { onSuccess: onSaved });
          else setConfirmSkip(true);
        }}
        className="flex flex-col gap-3"
      >
        {!passed && (
          <p
            className="flex items-start gap-2 text-13 leading-relaxed text-white/60"
            data-testid="vpn-skip-note"
          >
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
            <span>
              {t('wizard.vpn.skipNote')} <WhatsThis slug="vpn/README" />
            </span>
          </p>
        )}
        {save.isError && <ErrorAlert description={errorText(save.error)} />}
      </form>

      <AlertDialog open={confirmSkip} onOpenChange={setConfirmSkip}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('wizard.vpn.skipTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('wizard.vpn.skipBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setConfirmSkip(false);
                save.mutate({ mode: 'skipped' }, { onSuccess: onSaved });
              }}
            >
              {t('wizard.vpn.skipConfirm')}
            </AlertDialogAction>
            <AlertDialogCancel>{t('wizard.vpn.skipCancel')}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** The wizard's primary button: "Next" after a passed test, otherwise "Skip for now". */
export function VpnNextLabel() {
  const { t } = useTranslation();
  const config = useQuery({ queryKey: VPN_CONFIG_KEY, queryFn: api.vpnConfig });
  return <>{t(config.data?.config?.lastTest?.ok ? 'wizard.next' : 'wizard.vpn.skip')}</>;
}
