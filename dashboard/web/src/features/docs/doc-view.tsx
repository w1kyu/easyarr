import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { ErrorAlert } from '@/components/ui/alert';
import { Loading } from '@/components/ui/loading';
import { docAnchorFromHref, docImageUrl, docSlugFromHref, loadDoc } from './docs';

export type DocNavigate = (slug: string, anchor?: string | null) => void;

/**
 * Renders one docs page. Raw HTML in Markdown is not rendered (react-markdown's default), so docs
 * can't inject scripts. Headings get GitHub's anchors (rehype-slug), so `page.md#section` links work
 * the same here and on GitHub. Links to other docs stay inside the viewer; external links open a
 * new tab. Images only from docs/images/ (bundled; the CSP allows nothing else).
 */
export default function DocView({
  slug,
  anchor = null,
  onNavigate,
}: {
  slug: string;
  anchor?: string | null;
  onNavigate: DocNavigate;
}) {
  const { t } = useTranslation();
  const doc = useQuery({
    queryKey: ['doc', slug],
    queryFn: () => loadDoc(slug),
    staleTime: Infinity,
  });

  // Scroll to the section once the page is on screen (also when only the #anchor changes).
  const loaded = doc.data != null;
  useEffect(() => {
    if (!loaded || !anchor) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [loaded, anchor, slug]);

  if (doc.isPending) return <Loading />;
  if (doc.data == null) return <ErrorAlert description={t('docs.notFound')} />;
  return (
    <article
      data-testid="doc-view"
      className="prose prose-sm max-w-none prose-invert prose-headings:-tracking-2 prose-headings:scroll-mt-4 prose-h1:text-24 prose-h1:mb-4 prose-h2:text-17 prose-a:text-brand-lightest prose-table:text-13 prose-th:text-white/80 prose-p:text-white/80 prose-li:text-white/80 prose-img:rounded-12 prose-img:border prose-img:border-white/10 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:bg-black/30 [&_:not(pre)>code]:rounded-6 [&_:not(pre)>code]:bg-white/10 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5"
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          a: ({ href = '', children }) => {
            if (href.startsWith('#')) {
              const target = docAnchorFromHref(href);
              return (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(slug, target);
                  }}
                >
                  {children}
                </a>
              );
            }
            const target = docSlugFromHref(href, slug);
            if (target) {
              const hash = docAnchorFromHref(href);
              return (
                <a
                  href={`/help/${target}${hash ? `#${hash}` : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(target, hash);
                  }}
                >
                  {children}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => {
            const url = typeof src === 'string' ? docImageUrl(src, slug) : null;
            return url ? <img src={url} alt={alt ?? ''} loading="lazy" /> : null;
          },
        }}
      >
        {doc.data}
      </Markdown>
    </article>
  );
}
