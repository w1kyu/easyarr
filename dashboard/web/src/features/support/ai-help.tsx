import {
  AI_CHATS,
  AI_PROMPT_GOAL_MAX,
  fillAiPrompt,
  formatHelpContext,
  type HelpContext,
} from '@easyarr/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Copy, Download, ExternalLink, MessageCircleQuestion } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WhatsThis } from '~/features/docs/whats-this';
import { ApiError, supportApi } from '~/lib/api';
import { ErrorAlert, InfoAlert } from '@/components/ui/alert';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DialogCloseButton } from '@/components/ui/dialog-close-button';
import { Loading } from '@/components/ui/loading';
import { cn } from '@/lib/utils';

/**
 * Copies text. Umbrel serves apps over plain HTTP on the LAN, where browsers don't offer
 * navigator.clipboard (secure contexts only), so the old select-and-copy way is the fallback.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  let ok: boolean;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

interface AiHelpProps {
  context: HelpContext;
  /** The error the user is looking at (sent to the server, redacted there). */
  error?: string | undefined;
}

/** "Get help with AI" (SPEC §13): opens the dialog with the ready-made question. */
export function AiHelpButton({
  context,
  error,
  size = 'sm',
  className,
}: AiHelpProps & { size?: ButtonProps['size']; className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        data-testid="ai-help-button"
      >
        <MessageCircleQuestion className="size-3.5" aria-hidden />
        {t('support.ai.button')}
      </Button>
      {open && <AiHelpDialog context={context} error={error} onClose={() => setOpen(false)} />}
    </>
  );
}

/** An error message with "Get help with AI" right below it (every wizard error screen). */
export function HelpErrorAlert({
  description,
  context,
}: {
  description: string;
  context: HelpContext;
}) {
  return (
    <div className="flex flex-col gap-2">
      <ErrorAlert description={description} />
      <AiHelpButton context={context} error={description} className="self-start" />
    </div>
  );
}

function AiHelpDialog({ context, error, onClose }: AiHelpProps & { onClose: () => void }) {
  const { t } = useTranslation();
  const ids = { goal: useId(), lan: useId(), preview: useId() };
  const [goal, setGoal] = useState('');
  const [privateIps, setPrivateIps] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const ctx = formatHelpContext(context);
  const prompt = useQuery({
    queryKey: ['ai-prompt', ctx, error ?? '', privateIps],
    queryFn: () => supportApi.aiPrompt(ctx, error, privateIps),
    staleTime: 30_000,
    retry: false,
  });
  const text = prompt.data ? fillAiPrompt(prompt.data.prompt, goal) : '';

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async (what: string) => {
    const ok = await copyText(text);
    setCopyFailed(!ok);
    if (ok) setCopied(what);
    return ok;
  };

  const failedCode = prompt.error instanceof ApiError ? prompt.error.code : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[calc(100dvh-40px)] overflow-y-auto sm:max-w-[680px]"
        data-testid="ai-help-dialog"
      >
        <DialogCloseButton className="absolute top-3 right-3 z-10" />
        <div className="flex flex-col gap-1.5 pr-8">
          <DialogTitle>{t('support.ai.title')}</DialogTitle>
          <DialogDescription className="text-14 leading-relaxed text-white/70">
            {t('support.ai.intro')}
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.goal} className="px-[5px] text-13 font-medium text-white/70">
            {t('support.ai.goal')}
          </label>
          <textarea
            id={ids.goal}
            value={goal}
            maxLength={AI_PROMPT_GOAL_MAX}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
            placeholder={t('support.ai.goalPlaceholder')}
            className="rounded-16 border border-white/10 bg-white/4 px-4 py-3 text-14 text-white/90 placeholder:text-white/30 focus-visible:border-white/50 focus-visible:outline-hidden"
          />
        </div>

        <label htmlFor={ids.lan} className="flex items-center gap-2 px-[5px] text-13 text-white/70">
          <Checkbox
            id={ids.lan}
            checked={privateIps}
            onCheckedChange={(v) => setPrivateIps(v === true)}
          />
          {t('support.ai.hideLan')}
        </label>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.preview} className="px-[5px] text-13 font-medium text-white/70">
            {t('support.ai.preview')}
          </label>
          {prompt.isPending ? (
            <Loading />
          ) : prompt.isError ? (
            <ErrorAlert
              description={t(
                failedCode === 'redaction_failed'
                  ? 'support.ai.redactionFailed'
                  : 'support.ai.failed',
              )}
            />
          ) : (
            <textarea
              id={ids.preview}
              readOnly
              value={text}
              rows={12}
              spellCheck={false}
              data-testid="ai-help-preview"
              className="rounded-16 border border-white/10 bg-black/25 px-4 py-3 font-mono text-12 leading-relaxed text-white/85 focus-visible:border-white/50 focus-visible:outline-hidden"
            />
          )}
          {prompt.data?.truncated && (
            <p className="px-[5px] text-12 text-white/50">{t('support.ai.truncated')}</p>
          )}
        </div>

        {copyFailed && <InfoAlert description={t('support.ai.copyFailed')} />}

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="md"
              disabled={!prompt.data}
              onClick={() => void copy('copy')}
            >
              {copied === 'copy' ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
              {copied === 'copy' ? t('support.ai.copied') : t('support.ai.copy')}
            </Button>
            <span className="text-13 text-white/55">{t('support.ai.orOpen')}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {AI_CHATS.map((chat) => (
              <Button
                key={chat.id}
                type="button"
                size="sm"
                disabled={!prompt.data}
                onClick={() => {
                  // Copy first, while this tab still has focus; then open the chat.
                  void copy(chat.id);
                  window.open(chat.url, '_blank', 'noopener,noreferrer');
                }}
              >
                {copied === chat.id ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <ExternalLink className="size-3.5" aria-hidden />
                )}
                {t('support.ai.copyAndOpen', { name: chat.name })}
              </Button>
            ))}
          </div>
          <p className="text-12 text-white/50">{t('support.ai.pasteHint')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-white/8 pt-4">
          <DownloadDiagnosticsButton privateIps={privateIps} />
          <WhatsThis slug="getting-help" label={t('support.learnMore')} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Saves the diagnostics zip (SPEC §13). */
export function DownloadDiagnosticsButton({
  privateIps = false,
  className,
}: {
  privateIps?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const download = useMutation({ mutationFn: () => supportApi.downloadDiagnostics(privateIps) });
  const failedCode = download.error instanceof ApiError ? download.error.code : null;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Button
        type="button"
        size="sm"
        disabled={download.isPending}
        onClick={() => download.mutate()}
        data-testid="download-diagnostics"
      >
        <Download className="size-3.5" aria-hidden />
        {download.isPending ? t('support.diagnostics.preparing') : t('support.diagnostics.button')}
      </Button>
      {download.isError && (
        <ErrorAlert
          description={t(
            failedCode === 'redaction_failed'
              ? 'support.ai.redactionFailed'
              : 'support.diagnostics.failed',
          )}
        />
      )}
    </div>
  );
}
