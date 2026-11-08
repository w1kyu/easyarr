import { LOG_SOURCES, type LogLine, type LogSource } from '@easyarr/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassPanel } from '~/components/glass-panel';
import { SelectField } from '~/components/select-field';
import { Loading } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import { SectionTitle } from './dashboard';
import { useLog } from './status-api';

const LEVEL_CLASS: Record<LogLine['level'], string> = {
  error: 'text-red-300',
  warn: 'text-amber-200',
  info: 'text-white/75',
  debug: 'text-white/45',
};

/** Advanced mode: the newest lines of a service's own log, secrets masked by the server. */
export function LogViewer() {
  const { t } = useTranslation();
  const [source, setSource] = useState<LogSource>('vpn');
  const log = useLog(source);
  return (
    <section aria-labelledby="logs-title" data-testid="logs">
      <SectionTitle id="logs-title">{t('dash.logs.title')}</SectionTitle>
      <GlassPanel className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-4">
          <SelectField
            label={t('dash.logs.source')}
            value={source}
            onChange={(e) => setSource(e.target.value as LogSource)}
            className="sm:w-64"
          >
            {LOG_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`dash.logs.sources.${s}`)}
              </option>
            ))}
          </SelectField>
          <p className="text-12 text-white/45 sm:pb-2.5">{t('dash.logs.redacted')}</p>
        </div>
        <div
          className="max-h-96 overflow-auto rounded-12 bg-black/35 p-3 font-mono text-12 leading-relaxed"
          tabIndex={0}
          aria-label={t('dash.logs.title')}
        >
          {log.isPending ? (
            <Loading />
          ) : !log.data?.available ? (
            <p className="text-white/55">{t('dash.logs.unavailable')}</p>
          ) : log.data.lines.length === 0 ? (
            <p className="text-white/55">{t('dash.logs.empty')}</p>
          ) : (
            log.data.lines.map((line, i) => (
              <p key={i} className={cn('break-words whitespace-pre-wrap', LEVEL_CLASS[line.level])}>
                {line.time && (
                  <span className="mr-2 text-white/35">{new Date(line.time).toLocaleString()}</span>
                )}
                {line.message}
              </p>
            ))
          )}
        </div>
      </GlassPanel>
    </section>
  );
}
