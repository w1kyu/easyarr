import { ISSUES_URL } from '@easyarr/shared';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { GlassPanel } from '~/components/glass-panel';
import { DOC_SLUGS, docTitle, loadDoc } from '~/features/docs/docs';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AiHelpButton, DownloadDiagnosticsButton } from './ai-help';

/** /help: "Get help with AI", diagnostics, GitHub, and every guide (SPEC §13, §16). */
export function HelpHome() {
  const { t } = useTranslation();
  const titles = useQuery({
    queryKey: ['doc-titles'],
    queryFn: async () =>
      Promise.all(
        DOC_SLUGS.map(async (slug) => {
          const md = await loadDoc(slug);
          return { slug, title: (md && docTitle(md)) ?? slug };
        }),
      ),
    staleTime: Infinity,
  });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h2 className="text-24 font-bold -tracking-3">{t('support.help.title')}</h2>
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
      <GlassPanel className="flex flex-col gap-2">
        <h3 className="text-17 font-semibold">{t('support.help.docs')}</h3>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {(titles.data ?? DOC_SLUGS.map((slug) => ({ slug, title: slug }))).map((d) => (
            <li key={d.slug}>
              <Link
                to={`/help/${d.slug}`}
                className="text-14 text-white/80 underline-offset-4 hover:text-white hover:underline"
              >
                {d.title}
              </Link>
            </li>
          ))}
        </ul>
      </GlassPanel>
    </div>
  );
}
