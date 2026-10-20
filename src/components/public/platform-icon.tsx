import { PLATFORM_LOGOS } from "@/lib/platform-logos";
import { platformMeta } from "@/lib/platforms";

/**
 * The platform's own mark (Simple Icons) in its brand colour on a soft tile; monogram for platforms without one
 * or when an admin typed a custom icon letter. Near-white marks (TIDAL) get `data-mono` so light themes flip them dark.
 */
export function PlatformIcon({ platform, icon, iconUrl, className = "" }: { platform: string; icon?: string | null; /** Uploaded square image; beats both the platform mark and the monogram. */ iconUrl?: string | null; className?: string }) {
  const m = platformMeta(platform);
  const key = platform === "spotifyFollow" ? "spotify" : platform;
  const logo = !icon && !iconUrl ? PLATFORM_LOGOS[key as keyof typeof PLATFORM_LOGOS] : undefined;

  // An uploaded icon replaces the tile entirely rather than sitting inside it: the point of
  // uploading one is that the link had no mark worth tinting a tile for.
  if (iconUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={iconUrl} alt="" loading="lazy" decoding="async" aria-hidden
        className={`inline-flex h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-white/10 ${className}`} />
    );
  }
  const mono = /^#f{3}(f{3})?$/i.test(m.color) || m.color.toLowerCase() === "#e4e4e7";
  return (
    <span
      className={`platform-icon inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${className}`}
      style={{ backgroundColor: `${m.color}1f`, color: m.color, boxShadow: `inset 0 0 0 1px ${m.color}3d` }}
      data-mono={mono ? "" : undefined}
      aria-hidden
    >
      {logo ? (
        <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" fill="currentColor" role="img" aria-hidden focusable="false">
          <path d={logo.path} />
        </svg>
      ) : (
        icon || m.monogram
      )}
    </span>
  );
}
