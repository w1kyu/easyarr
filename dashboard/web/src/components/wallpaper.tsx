import { WALLPAPER_URL } from '~/lib/wallpaper';

/**
 * Fixed wallpaper behind everything (umbrelOS look, EasyArr's own image). The image is pre-blurred
 * and tiny (scripts/make-wallpaper.py), so no CSS blur is needed — cheap on a Raspberry Pi.
 */
export function Wallpaper() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#0b0b14]"
    >
      <img
        src={WALLPAPER_URL}
        alt=""
        className="absolute inset-0 size-full scale-110 object-cover blur-[var(--wallpaper-blur)] duration-700 animate-in fade-in"
      />
      <div className="absolute inset-0 bg-black/20" />
    </div>
  );
}
