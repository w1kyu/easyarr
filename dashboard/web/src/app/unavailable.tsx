import { PlugZap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { SERVICES } from '@easyarr/shared';
import { EmptyState } from '~/components/empty-state';
import { GlassPanel } from '~/components/glass-panel';
import { buttonVariants } from '@/components/ui/button';

/** Shown when the proxy at /apps/<service>/ can't reach the service (it is starting or stopped). */
export function Unavailable() {
  const { t } = useTranslation();
  const { service } = useParams();
  const svc = SERVICES.find((s) => s.id === service && s.urlBase);
  if (!svc?.urlBase) {
    return (
      <GlassPanel>
        <EmptyState icon={PlugZap} title={t('unavailable.unknown')} />
      </GlassPanel>
    );
  }
  return (
    <GlassPanel>
      <EmptyState
        icon={PlugZap}
        title={t('unavailable.title', { name: svc.name })}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {/* A full page load: the service UI isn't part of this web app. */}
            <a
              href={`${svc.urlBase}/`}
              className={buttonVariants({ size: 'md', variant: 'primary' })}
            >
              {t('unavailable.retry')}
            </a>
            <Link to="/" className={buttonVariants({ size: 'md' })}>
              {t('notFound.back')}
            </Link>
          </div>
        }
      >
        {t('unavailable.body', { name: svc.name })}
      </EmptyState>
    </GlassPanel>
  );
}
