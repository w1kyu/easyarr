import { useQuery } from '@tanstack/react-query';
import { DOC_SLUGS, docTitle, loadDoc } from './docs';

export interface LoadedDoc {
  slug: string;
  title: string;
  markdown: string;
}

/** Every guide with its title, for the navigation and the search (≈100 KB of text, loaded once). */
export function useAllDocs() {
  return useQuery({
    queryKey: ['docs-all'],
    queryFn: async (): Promise<LoadedDoc[]> =>
      Promise.all(
        DOC_SLUGS.map(async (slug) => {
          const markdown = (await loadDoc(slug)) ?? '';
          return { slug, title: docTitle(markdown) ?? slug, markdown };
        }),
      ),
    staleTime: Infinity,
  });
}

/** slug → title, falling back to the slug while the docs load. */
export function useDocTitles(): (slug: string) => string {
  const docs = useAllDocs();
  const titles = new Map(docs.data?.map((d) => [d.slug, d.title]));
  return (slug) => titles.get(slug) ?? slug;
}
