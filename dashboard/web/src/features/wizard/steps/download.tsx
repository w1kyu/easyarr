import { DOWNLOAD_METHODS, type DownloadMethod } from '@easyarr/shared';
import * as RadioGroup from '@radix-ui/react-radio-group';
import { Check, Magnet, Newspaper, Layers, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WhatsThis } from '~/features/docs/whats-this';
import { ErrorAlert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useSaveErrorText, useSaveStep, type StepFormProps } from '../wizard-api';

const CARDS: Record<
  DownloadMethod,
  { icon: typeof Magnet; pros: number; cons: number; doc?: string; recommended?: boolean }
> = {
  torrents: { icon: Magnet, pros: 2, cons: 2, doc: 'torrents-101', recommended: true },
  usenet: { icon: Newspaper, pros: 2, cons: 2, doc: 'usenet-101' },
  both: { icon: Layers, pros: 1, cons: 1 },
};

/** Step 4: Torrents / Usenet / Both, as cards with plain pros and cons (SPEC §8). */
export function DownloadStep({ formId, view, onSaved }: StepFormProps) {
  const { t } = useTranslation();
  const save = useSaveStep('download');
  const errorText = useSaveErrorText();
  const [method, setMethod] = useState<DownloadMethod | ''>(view.answers.download?.method ?? '');
  const [missing, setMissing] = useState(false);

  return (
    <form
      id={formId}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!method) {
          setMissing(true);
          return;
        }
        save.mutate({ method }, { onSuccess: onSaved });
      }}
    >
      <RadioGroup.Root
        value={method}
        onValueChange={(v) => {
          setMethod(v as DownloadMethod);
          setMissing(false);
        }}
        aria-label={t('wizard.download.title')}
        className="grid grid-cols-1 gap-3 md:grid-cols-3"
      >
        {DOWNLOAD_METHODS.map((id) => {
          const card = CARDS[id];
          const Icon = card.icon;
          const selected = method === id;
          return (
            <div key={id} className="flex flex-col">
              <RadioGroup.Item
                value={id}
                id={`download-${id}`}
                aria-labelledby={`download-${id}-title`}
                aria-describedby={`download-${id}-details`}
                className={cn(
                  'group relative flex flex-1 flex-col gap-3 rounded-16 border p-4 text-left transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-white/25 focus-visible:outline-hidden',
                  selected
                    ? 'border-brand bg-brand/15'
                    : 'border-white/10 bg-white/4 hover:border-white/20 hover:bg-white/7',
                )}
              >
                <span className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-full bg-white/10">
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  <span id={`download-${id}-title`} className="text-15 font-semibold -tracking-2">
                    {t(`download.${id}.title`)}
                  </span>
                  <span
                    className={cn(
                      'ml-auto grid size-5 place-items-center rounded-full border',
                      selected ? 'border-brand bg-brand' : 'border-white/25',
                    )}
                    aria-hidden
                  >
                    {selected && <Check className="size-3.5" />}
                  </span>
                </span>
                {card.recommended && (
                  <span className="self-start rounded-full bg-white/10 px-2 py-0.5 text-11 font-medium text-white/75">
                    {t('download.recommendedStart')}
                  </span>
                )}
                <span id={`download-${id}-details`} className="flex flex-col gap-3">
                  <span className="text-13 leading-relaxed text-white/70">
                    {t(`download.${id}.summary`)}
                  </span>
                  <span className="flex flex-col gap-1 text-13 text-white/75">
                    {Array.from({ length: card.pros }, (_, i) => (
                      <span key={`p${i}`} className="flex gap-1.5">
                        <Plus className="mt-0.5 size-3.5 shrink-0 text-emerald-400" aria-hidden />
                        <span>
                          <span className="sr-only">{t('download.pro')}: </span>
                          {t(`download.${id}.pro${i + 1}`)}
                        </span>
                      </span>
                    ))}
                    {Array.from({ length: card.cons }, (_, i) => (
                      <span key={`c${i}`} className="flex gap-1.5">
                        <Minus className="mt-0.5 size-3.5 shrink-0 text-amber-400" aria-hidden />
                        <span>
                          <span className="sr-only">{t('download.con')}: </span>
                          {t(`download.${id}.con${i + 1}`)}
                        </span>
                      </span>
                    ))}
                  </span>
                </span>
              </RadioGroup.Item>
              {card.doc ? (
                <WhatsThis
                  slug={card.doc}
                  label={t(`download.${id}.learnMore`)}
                  className="mt-2 h-5 self-start px-1"
                />
              ) : (
                // Same height as the help links, so all cards line up.
                <span className="mt-2 hidden h-5 md:block" aria-hidden />
              )}
            </div>
          );
        })}
      </RadioGroup.Root>
      <p className="text-13 text-white/55">{t('download.changeLater')}</p>
      {missing && <ErrorAlert description={t('wizard.error.downloadMethodRequired')} />}
      {save.isError && <ErrorAlert description={errorText(save.error)} />}
    </form>
  );
}
