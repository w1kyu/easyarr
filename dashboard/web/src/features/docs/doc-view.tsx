import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ErrorAlert } from '@/components/ui/alert';
import { Loading } from '@/components/ui/loading';
import { docSlugFromHref, loadDoc } from './docs';

/**
 * Renders one docs page. Raw HTML in Markdown is not rendered (react-markdown's default), so docs
 * can't inject scripts. Links to other docs stay inside the viewer; external links open a new tab.
 */
export default function DocView({
  slug,
  onNavigate,
}: {
  slug: string;
  onNavigate: (slug: string) => void;
}) {
  const { t } = useTranslation();
  const doc = useQuery({
    queryKey: ['doc', slug],
    queryFn: () => loadDoc(slug),
    staleTime: Infinity,
  });
  if (doc.isPending) return <Loading />;
  if (doc.data == null) return <ErrorAlert description={t('docs.notFound')} />;
  return (
    <article className="prose prose-sm max-w-none prose-invert prose-headings:-tracking-2 prose-h1:text-24 prose-h1:mb-4 prose-h2:text-17 prose-a:text-brand-lightest prose-table:text-13 prose-th:text-white/80 prose-p:text-white/80 prose-li:text-white/80">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href = '', children }) => {
            const target = docSlugFromHref(href);
            if (target) {
              return (
                <a
                  href={`/help/${target}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(target);
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
          img: () => null,
        }}
      >
        {doc.data}
      </Markdown>
    </article>
  );
}
