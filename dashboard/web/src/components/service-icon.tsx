import type { ServiceId } from '@easyarr/shared';
import {
  AudioLines,
  Captions,
  Clapperboard,
  Download,
  Film,
  Inbox,
  PackageOpen,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tv,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ICONS: Record<ServiceId, { icon: LucideIcon; tint: string }> = {
  jellyfin: { icon: Clapperboard, tint: 'from-violet-500 to-indigo-600' },
  jellyseerr: { icon: Sparkles, tint: 'from-fuchsia-500 to-violet-600' },
  sonarr: { icon: Tv, tint: 'from-sky-500 to-blue-600' },
  radarr: { icon: Film, tint: 'from-amber-500 to-orange-600' },
  lidarr: { icon: AudioLines, tint: 'from-emerald-500 to-teal-600' },
  prowlarr: { icon: Search, tint: 'from-orange-500 to-red-600' },
  qbittorrent: { icon: Download, tint: 'from-blue-500 to-cyan-600' },
  sabnzbd: { icon: Inbox, tint: 'from-yellow-500 to-amber-600' },
  bazarr: { icon: Captions, tint: 'from-cyan-500 to-sky-600' },
  cleanuparr: { icon: Trash2, tint: 'from-rose-500 to-pink-600' },
  flaresolverr: { icon: ShieldCheck, tint: 'from-slate-500 to-slate-700' },
  recyclarr: { icon: SlidersHorizontal, tint: 'from-lime-500 to-green-600' },
  unpackerr: { icon: PackageOpen, tint: 'from-stone-500 to-stone-700' },
};

/** Our own tile icons (upstream logos are not bundled). */
export function ServiceIcon({
  id,
  size = 48,
  className,
}: {
  id: ServiceId;
  size?: number;
  className?: string;
}) {
  const { icon: Icon, tint } = ICONS[id];
  return (
    <div
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        'grid shrink-0 place-items-center rounded-[28%] bg-gradient-to-br shadow-md shadow-black/30 ring-1 ring-white/15',
        tint,
        className,
      )}
    >
      <Icon
        className="text-white"
        style={{ width: size * 0.48, height: size * 0.48 }}
        strokeWidth={2}
      />
    </div>
  );
}
