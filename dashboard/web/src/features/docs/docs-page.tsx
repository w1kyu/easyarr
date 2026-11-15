import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { GlassPanel } from '~/components/glass-panel';
import { NotFound } from '~/app/not-found';
import { Loading } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import { HelpHome } from '~/features/support/help-home';
import { DOC_SECTIONS, docNeighbours, hasDoc } from './docs';
import { useDocTitles } from './use-docs';

const DocView = lazy(() => import('./doc-view'));

export function docHref(slug: string, anchor?: string | null): string {
  return `/help/${slug}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`;
}

/** /help (help home) and the full-page docs viewer at /help/<slug>#<section>. */
export function DocsPage() {
  const { t } = useTranslation();
  const { '*': slug = '' } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const anchor = hash ? decodeURIComponent(hash.slice(1)) : null;

  // A new page starts at the top, unless the link points at a section.
  useEffect(() => {
    if (!anchor) window.scrollTo({ top: 0 });
  }, [slug, anchor]);

  if (slug === '') return <HelpHome />;
  if (!hasDoc(slug)) return <NotFound />;
  const { prev, next } = docNeighbours(slug);
  return (
    <div className="flex gap-6">
      <DocsNav current={slug} className="hidden w-56 shrink-0 lg:flex" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => void (window.history.length > 1 ? navigate(-1) : navigate('/'))}
            className="inline-flex items-center gap-1.5 text-13 text-white/60 hover:text-white"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t('docs.back')}
          </button>
          <Link
            to="/help"
            className="inline-flex items-center gap-1.5 text-13 text-white/60 hover:text-white lg:hidden"
          >
            <BookOpen className="size-4" aria-hidden />
            {t('docs.allGuides')}
          </Link>
        </div>
        <GlassPanel>
          <Suspense fallback={<Loading />}>
            <DocView
              slug={slug}
              anchor={anchor}
              onNavigate={(s, a) => void navigate(docHref(s, a))}
            />
          </Suspense>
        </GlassPanel>
        <PrevNext prev={prev} next={next} />
      </div>
    </div>
  );
}

function PrevNext({ prev, next }: { prev: string | null; next: string | null }) {
  const { t } = useTranslation();
  const title = useDocTitles();
  const card =
    'flex min-w-0 flex-1 flex-col gap-0.5 rounded-16 border border-white/10 bg-white/4 px-4 py-3 transition-colors hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-hidden';
  return (
    <nav aria-label={t('docs.pager')} className="flex flex-col gap-2 sm:flex-row">
      {prev ? (
        <Link to={docHref(prev)} className={card} data-testid="doc-prev">
          <span className="inline-flex items-center gap-1 text-12 text-white/50">
            <ArrowLeft className="size-3.5" aria-hidden />
            {t('docs.previous')}
          </span>
          <span className="truncate text-14 text-white/85">{title(prev)}</span>
        </Link>
      ) : (
        <span className="hidden flex-1 sm:block" />
      )}
      {next && (
        <Link to={docHref(next)} className={cn(card, 'sm:items-end')} data-testid="doc-next">
          <span className="inline-flex items-center gap-1 text-12 text-white/50">
            {t('docs.next')}
            <ArrowRight className="size-3.5" aria-hidden />
          </span>
          <span className="max-w-full truncate text-14 text-white/85">{title(next)}</span>
        </Link>
      )}
    </nav>
  );
}

/** Every guide, grouped as in docs/nav.json. */
export function DocsNav({ current, className }: { current?: string; className?: string }) {
  const { t } = useTranslation();
  const title = useDocTitles();
  return (
    <nav
      aria-label={t('docs.allGuides')}
      className={cn(
        'sticky top-4 flex max-h-[calc(100dvh-32px)] flex-col gap-4 self-start overflow-y-auto',
        className,
      )}
      data-testid="docs-nav"
    >
      {DOC_SECTIONS.map((section) => (
        <div key={section.id} className="flex flex-col gap-1">
          <h3 className="px-2 text-12 font-semibold tracking-wide text-white/45 uppercase">
            {t(`docs.section.${section.id}`)}
          </h3>
          <ul className="flex flex-col">
            {section.pages.map((slug) => (
              <li key={slug}>
                <Link
                  to={docHref(slug)}
                  aria-current={slug === current ? 'page' : undefined}
                  className={cn(
                    'block rounded-10 px-2 py-1 text-13 text-white/70 transition-colors hover:bg-white/8 hover:text-white',
                    slug === current && 'bg-white/10 font-medium text-white',
                  )}
                >
                  {title(slug)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
