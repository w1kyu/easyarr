import { ISSUES_URL } from '@easyarr/shared';
import { ExternalLink, Search } from 'lucide-react';
import { useDeferredValue, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { GlassPanel } from '~/components/glass-panel';
import { DOC_SECTIONS, searchDocs } from '~/features/docs/docs';
import { docHref } from '~/features/docs/docs-page';
import { useAllDocs, useDocTitles } from '~/features/docs/use-docs';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AiHelpButton, DownloadDiagnosticsButton } from './ai-help';

/** /help: search, every guide by section, "Get help with AI", diagnostics, GitHub (SPEC §13, §16). */
export function HelpHome() {
  const { t } = useTranslation();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim());
  const docs = useAllDocs();
  const title = useDocTitles();
  const hits = deferred && docs.data ? searchDocs(docs.data, deferred) : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h2 className="text-24 font-bold -tracking-3">{t('support.help.title')}</h2>

      <GlassPanel className="flex flex-col gap-3">
        <label htmlFor={searchId} className="text-17 font-semibold">
          {t('docs.search.label')}
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-white/40"
            aria-hidden
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('docs.search.placeholder')}
            autoComplete="off"
            data-testid="docs-search"
            className="w-full rounded-16 border border-white/10 bg-white/4 py-3 pr-4 pl-10 text-14 text-white/90 placeholder:text-white/30 focus-visible:border-white/50 focus-visible:outline-hidden"
          />
        </div>
        {hits && (
          <div aria-live="polite" className="flex flex-col gap-2" data-testid="docs-search-results">
            <p className="text-13 text-white/55">
              {hits.length === 0
                ? t('docs.search.none', { query: deferred })
                : t('docs.search.results', { count: hits.length })}
            </p>
            <ul className="flex flex-col gap-1">
              {hits.map((hit) => (
                <li key={`${hit.slug}#${hit.anchor ?? ''}`}>
                  <Link
                    to={docHref(hit.slug, hit.anchor)}
                    className="flex flex-col gap-0.5 rounded-12 px-3 py-2 transition-colors hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-hidden"
                  >
                    <span className="text-14 font-medium text-white/90">
                      {hit.title}
                      {hit.heading && <span className="text-white/50"> › {hit.heading}</span>}
                    </span>
                    <span className="line-clamp-2 text-13 text-white/60">{hit.snippet}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </GlassPanel>

      <GlassPanel className="flex flex-col gap-3" data-testid="help-get-help">
        <h3 className="text-17 font-semibold">{t('support.help.stuck')}</h3>
        <p className="text-14 leading-relaxed text-white/70">{t('support.help.stuckBody')}</p>
        <div className="flex flex-wrap items-start gap-2">
          <AiHelpButton context={{ area: 'general' }} size="md" />
          <DownloadDiagnosticsButton />
          <a
            href={ISSUES_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ size: 'sm' }))}
          >
            <ExternalLink className="size-3.5" aria-hidden />
            {t('support.help.issue')}
          </a>
        </div>
      </GlassPanel>

      <GlassPanel className="flex flex-col gap-4">
        <h3 className="text-17 font-semibold">{t('support.help.docs')}</h3>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {DOC_SECTIONS.map((section) => (
            <div key={section.id} className="flex flex-col gap-1.5">
              <h4 className="text-12 font-semibold tracking-wide text-white/45 uppercase">
                {t(`docs.section.${section.id}`)}
              </h4>
              <ul className="flex flex-col gap-1">
                {section.pages.map((slug) => (
                  <li key={slug}>
                    <Link
                      to={docHref(slug)}
                      className="text-14 text-white/80 underline-offset-4 hover:text-white hover:underline"
                    >
                      {title(slug)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}
