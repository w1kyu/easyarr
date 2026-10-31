import { VPN_PROVIDERS, providerProtocols, type VpnGroup, type VpnProvider } from '@easyarr/shared';
import { ArrowRightLeft, ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const GROUPS: readonly VpnGroup[] = ['recommended', 'works', 'custom'];

/** Searchable, grouped list of every provider EasyArr supports (SPEC §9.1 step 1). */
export function ProviderPicker({ onPick }: { onPick: (provider: VpnProvider) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (p: VpnProvider) =>
      !q || p.name.toLowerCase().includes(q) || p.id.includes(q.replace(/\s+/g, ''));
    return GROUPS.map((g) => ({
      id: g,
      providers: VPN_PROVIDERS.filter((p) => p.group === g && match(p)),
    })).filter((g) => g.providers.length > 0);
  }, [query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-white/40"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('vpn.picker.search')}
          aria-label={t('vpn.picker.search')}
          className="pl-11 text-white/90"
        />
      </div>
      {groups.length === 0 && <p className="text-14 text-white/60">{t('vpn.picker.noMatch')}</p>}
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`vpn-group-${group.id}`}>
          <h3 id={`vpn-group-${group.id}`} className="px-1 text-14 font-semibold">
            {t(`vpn.group.${group.id}.title`)}
          </h3>
          <p className="mb-2 px-1 text-13 text-white/55">{t(`vpn.group.${group.id}.body`)}</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {group.providers.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  data-testid={`vpn-provider-${p.id}`}
                  className="flex w-full items-center gap-3 rounded-12 border border-white/10 bg-white/4 p-3 text-left transition-colors hover:border-white/20 hover:bg-white/8 focus-visible:ring-3 focus-visible:ring-white/25 focus-visible:outline-hidden"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-14 font-semibold">{p.name}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {p.portForwarding !== 'none' && p.group !== 'custom' && (
                        <Tag className="bg-emerald-400/15 text-emerald-200">
                          <ArrowRightLeft className="size-3" aria-hidden />
                          {t('vpn.badge.portForwarding')}
                        </Tag>
                      )}
                      {providerProtocols(p).map((proto) => (
                        <Tag key={proto}>{t(`vpn.protocol.${proto}`)}</Tag>
                      ))}
                      {p.tutorial !== 'vpn/generic' && p.group !== 'custom' && (
                        <Tag>{t('vpn.badge.guide')}</Tag>
                      )}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-white/40" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-11 font-medium text-white/70',
        className,
      )}
    >
      {children}
    </span>
  );
}
