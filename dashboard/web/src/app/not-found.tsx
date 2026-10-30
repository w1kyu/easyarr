import { Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { EmptyState } from '~/components/empty-state';
import { GlassPanel } from '~/components/glass-panel';
import { buttonVariants } from '@/components/ui/button';

export function NotFound() {
  const { t } = useTranslation();
  return (
    <GlassPanel>
      <EmptyState
        icon={Compass}
        title={t('notFound.title')}
        action={
          <Link to="/" className={buttonVariants({ size: 'md' })}>
            {t('notFound.back')}
          </Link>
        }
      />
    </GlassPanel>
  );
}
