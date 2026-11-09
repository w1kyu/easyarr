import type { StuckAction, StuckItem } from '@easyarr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Film, Tv } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassPanel } from '~/components/glass-panel';
import { api } from '~/lib/api';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatBytes } from './format';
import { STATUS_QUERY_KEY } from './status-api';

/**
 * "Needs your OK" (owner's item 11, D-068): requests that haven't arrived, why, and a button.
 * Shown in Simple mode too; nothing here happens without a click.
 */
export function StuckList({ items }: { items: StuckItem[] }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="stuck-title" data-testid="stuck">
      <h2
        id="stuck-title"
        className="mb-2.5 px-1 text-13 font-semibold tracking-wide text-white/50 uppercase"
      >
        {t('stuck.title')}
      </h2>
      <GlassPanel className="flex flex-col divide-y divide-white/8 p-2">
        {items.map((item) => (
          <StuckRow key={item.id} item={item} />
        ))}
      </GlassPanel>
    </section>
  );
}

const PRIMARY: Partial<Record<StuckAction, true>> = { accept: true, retry: true, replace: true };

function StuckRow({ item }: { item: StuckItem }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [changed, setChanged] = useState(false);
  const act = useMutation({
    mutationFn: (action: StuckAction) => api.stuckAction(item.id, action),
    onSuccess: (r) => {
      setChanged(r.result === 'changed');
      void client.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
    },
  });
  const offer = item.offer;
  const vars = {
    title: item.title,
    detail: item.detail ?? '',
    languages: offer?.languages.join(', ') || t('stuck.unknownLanguage'),
    quality: offer?.quality ?? '',
    size: offer ? formatBytes(offer.sizeBytes) : '',
  };
  const Icon = item.type === 'movie' ? Film : Tv;
  return (
    <div
      className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center"
      data-stuck={item.kind}
      data-id={item.id}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-12 bg-white/8">
          <Icon className="size-4 text-white/70" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-14 font-semibold" title={item.title}>
            {item.title}
          </p>
          <p className="text-13 leading-relaxed text-white/65">
            {t(`stuck.${item.kind}.body`, vars)}
          </p>
          {offer && offer.seeders !== null && (
            <p className="text-12 text-white/45">{t('stuck.seeders', { count: offer.seeders })}</p>
          )}
          {changed && <p className="text-12 text-amber-200">{t('stuck.changed')}</p>}
          {act.isError && <ErrorAlert description={t('stuck.failed')} />}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        {item.actions.map((action) => (
          <Button
            key={action}
            size="sm"
            variant={PRIMARY[action] ? 'primary' : 'default'}
            disabled={act.isPending}
            onClick={() => act.mutate(action)}
          >
            {t(
              action === 'dismiss'
                ? item.kind === 'autoAccepted'
                  ? 'stuck.ok'
                  : 'stuck.dismiss'
                : `stuck.${item.kind}.action`,
              vars,
            )}
          </Button>
        ))}
      </div>
    </div>
  );
}
