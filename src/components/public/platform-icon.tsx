import { PLATFORM_LOGOS } from "@/lib/platform-logos";
import { platformMeta } from "@/lib/platforms";

/**
 * The platform's own mark (Simple Icons) in its brand colour on a soft tile; monogram for platforms without one
 * or when an admin typed a custom icon letter. Near-white marks (TIDAL) get `data-mono` so light themes flip them dark.
 */
export function PlatformIcon({ platform, icon, className = "" }: { platform: string; icon?: string | null; className?: string }) {
  const m = platformMeta(platform);
  const key = platform === "spotifyFollow" ? "spotify" : platform;
  const logo = !icon ? PLATFORM_LOGOS[key as keyof typeof PLATFORM_LOGOS] : undefined;
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
