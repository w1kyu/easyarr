import { ArrowLeft } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { GlassPanel } from '~/components/glass-panel';
import { NotFound } from '~/app/not-found';
import { Loading } from '@/components/ui/loading';
import { hasDoc } from './docs';

const DocView = lazy(() => import('./doc-view'));

/** Full-page docs viewer at /help/:slug (polished in phase 10). */
export function DocsPage() {
  const { t } = useTranslation();
  const { '*': slug = '' } = useParams();
  const navigate = useNavigate();
  if (!hasDoc(slug)) return <NotFound />;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      <button
        type="button"
        onClick={() => void (window.history.length > 1 ? navigate(-1) : navigate('/'))}
        className="inline-flex items-center gap-1.5 self-start text-13 text-white/60 hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('docs.back')}
      </button>
      <GlassPanel>
        <Suspense fallback={<Loading />}>
          <DocView slug={slug} onNavigate={(s) => void navigate(`/help/${s}`)} />
        </Suspense>
      </GlassPanel>
    </div>
  );
}
