import { platformMeta } from "@/lib/platforms";

/** Neutral monogram badge in the platform's accent colour (no third-party logos bundled). */
export function PlatformIcon({ platform, className = "" }: { platform: string; className?: string }) {
  const m = platformMeta(platform);
  return (
    <span
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${className}`}
      style={{ backgroundColor: `${m.color}22`, color: m.color, boxShadow: `inset 0 0 0 1px ${m.color}44` }}
      aria-hidden
    >
      {m.monogram}
    </span>
  );
}
