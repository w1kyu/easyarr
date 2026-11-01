import {
  LANGUAGES,
  LIBRARY_IDS,
  QUALITY_PRESETS,
  libraryAnswersSchema,
  DEFAULT_LIBRARY_ANSWERS,
  type LanguageCode,
  type LibraryAnswers,
  type LibraryId,
  type QualityPreset,
} from '@easyarr/shared';
import * as RadioGroup from '@radix-ui/react-radio-group';
import { Check, Clapperboard, Music, Tv } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectField } from '~/components/select-field';
import { WhatsThis } from '~/features/docs/whats-this';
import { ApiError } from '~/lib/api';
import { ErrorAlert } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useIssueText, useSaveErrorText, useSaveStep, type StepFormProps } from '../wizard-api';

const LIBRARY_ICONS: Record<LibraryId, typeof Tv> = {
  movies: Clapperboard,
  tv: Tv,
  music: Music,
};

/** Language names in the UI's language ("German"), from the browser — no list to translate. */
function useLanguageNames() {
  const { i18n } = useTranslation();
  return useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([i18n.language || 'en'], { type: 'language' });
    } catch {
      names = null;
    }
    return (code: string) => names?.of(code) ?? code;
  }, [i18n.language]);
}

/**
 * Step 8 "What do you want?" (SPEC §8): which libraries, the language for subtitles and titles, and
 * a quality preset (mapped to TRaSH guide profiles via Recyclarr and EasyArr's Lidarr profile).
 */
export function LibraryStep({ formId, view, onSaved }: StepFormProps) {
  const { t } = useTranslation();
  const save = useSaveStep('library');
  const issueText = useIssueText();
  const errorText = useSaveErrorText();
  const languageName = useLanguageNames();
  const [form, setForm] = useState<LibraryAnswers>(view.answers.library ?? DEFAULT_LIBRARY_ANSWERS);
  const [error, setError] = useState<string | null>(null);
  const languages = useMemo(
    () => [...LANGUAGES].sort((a, b) => languageName(a.code).localeCompare(languageName(b.code))),
    [languageName],
  );

  return (
    <form
      id={formId}
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = libraryAnswersSchema.safeParse(form);
        if (!parsed.success) {
          setError(issueText(parsed.error.issues[0]?.message ?? 'wizard.error.generic'));
          return;
        }
        setError(null);
        save.mutate(parsed.data, {
          onSuccess: onSaved,
          onError: (err) => {
            if (err instanceof ApiError && err.issues[0])
              setError(issueText(err.issues[0].message));
          },
        });
      }}
    >
      <section aria-labelledby="library-libraries" className="flex flex-col gap-3">
        <h3 id="library-libraries" className="text-17 font-semibold -tracking-2">
          {t('library.libraries.title')}
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {LIBRARY_IDS.map((id) => {
            const Icon = LIBRARY_ICONS[id];
            const on = form.libraries[id];
            return (
              <label
                key={id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-16 border p-4 transition-colors',
                  on ? 'border-brand/60 bg-brand/10' : 'border-white/10 bg-white/4',
                )}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <span className="flex flex-1 flex-col gap-1">
                  <span className="text-15 font-semibold -tracking-2">
                    {t(`library.libraries.${id}.title`)}
                  </span>
                  <span className="text-13 leading-relaxed text-white/60">
                    {t(`library.libraries.${id}.body`)}
                  </span>
                </span>
                <Switch
                  checked={on}
                  aria-label={t(`library.libraries.${id}.title`)}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, libraries: { ...f.libraries, [id]: v } }))
                  }
                />
              </label>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="library-language" className="flex flex-col gap-3">
        <h3 id="library-language" className="text-17 font-semibold -tracking-2">
          {t('library.language.title')}
        </h3>
        <SelectField
          label={t('library.language.label')}
          value={form.language}
          className="md:max-w-sm"
          onChange={(e) => setForm((f) => ({ ...f, language: e.target.value as LanguageCode }))}
          hint={t('library.language.hint')}
        >
          {languages.map((l) => (
            <option key={l.code} value={l.code}>
              {languageName(l.code)}
            </option>
          ))}
        </SelectField>
      </section>

      <section aria-labelledby="library-quality" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 id="library-quality" className="text-17 font-semibold -tracking-2">
            {t('library.quality.title')}
          </h3>
          <WhatsThis slug="quality-presets" />
        </div>
        <RadioGroup.Root
          value={form.quality}
          onValueChange={(v) => setForm((f) => ({ ...f, quality: v as QualityPreset }))}
          aria-labelledby="library-quality"
          className="grid grid-cols-1 gap-3 md:grid-cols-3"
        >
          {QUALITY_PRESETS.map((id) => {
            const selected = form.quality === id;
            return (
              <RadioGroup.Item
                key={id}
                value={id}
                aria-labelledby={`quality-${id}-title`}
                aria-describedby={`quality-${id}-body`}
                className={cn(
                  'flex flex-col gap-2 rounded-16 border p-4 text-left transition-colors focus-visible:ring-3 focus-visible:ring-white/25 focus-visible:outline-hidden',
                  selected
                    ? 'border-brand bg-brand/15'
                    : 'border-white/10 bg-white/4 hover:border-white/20 hover:bg-white/7',
                )}
              >
                <span className="flex items-center gap-2">
                  <span id={`quality-${id}-title`} className="text-15 font-semibold -tracking-2">
                    {t(`library.quality.${id}.title`)}
                  </span>
                  {id === 'balanced' && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-11 font-medium text-white/75">
                      {t('library.quality.recommended')}
                    </span>
                  )}
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
                <span id={`quality-${id}-body`} className="flex flex-col gap-2">
                  <span className="text-13 leading-relaxed text-white/70">
                    {t(`library.quality.${id}.body`)}
                  </span>
                  <span className="text-12 leading-relaxed text-white/50">
                    {t(`library.quality.${id}.size`)}
                  </span>
                </span>
              </RadioGroup.Item>
            );
          })}
        </RadioGroup.Root>
        <p className="text-13 text-white/55">{t('library.quality.changeLater')}</p>
      </section>

      {error && <ErrorAlert description={error} />}
      {save.isError && !error && <ErrorAlert description={errorText(save.error)} />}
    </form>
  );
}
