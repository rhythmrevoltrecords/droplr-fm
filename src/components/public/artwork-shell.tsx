import Image from "next/image";
import { SITE_URL } from "@/lib/env";
import { platformMeta } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { Pixels } from "./pixels";
import { PlatformIcon } from "./platform-icon";

/**
 * The artwork-driven page system shared by every public droplr.fm page
 * (pre-save, smart link, bio link, and the coming-soon previews).
 *
 * accentColor is extracted from the artwork with sharp at upload/resolve time
 * (src/lib/color.ts) and stored on the record — pages never render a flat colour.
 */
export const DEFAULT_ACCENT = "#8B5CF6";

export type PublicTheme = "dark" | "light" | "system";

/** Label setting → theme for public pages (dark unless "Apply theme to public smart links" is on). */
export function publicTheme(org: { themePublic?: boolean | null; themePreference?: string | null }): PublicTheme {
  if (!org.themePublic) return "dark";
  return org.themePreference === "light" || org.themePreference === "system" ? org.themePreference : "dark";
}

export type ShellPixels = { meta: string | null; tiktok: string | null; ga4: string | null; contentName: string };

export function ArtworkPageShell({
  accentColor,
  children,
  footer,
  pixels,
  preview = false,
  theme = "dark",
}: {
  /** Kept for callers; the background is now painted from accentColor only (no blurred artwork copy). */
  imageUrl?: string;
  accentColor: string | null | undefined;
  children: React.ReactNode;
  footer?: React.ReactNode;
  pixels?: ShellPixels | null;
  /** Renders inside a fixed-size box (admin previews) instead of the full viewport. */
  preview?: boolean;
  /** "dark" (default) is the signature look. light/system only when the label opts in for public pages. */
  theme?: PublicTheme;
}) {
  const accent = accentColor || DEFAULT_ACCENT;
  const themed = theme === "light" || theme === "system";
  return (
    <main className={cn("relative overflow-hidden bg-black text-white", preview ? "h-full w-full" : "min-h-dvh", themed && `shell-theme-${theme}`)}>
      {/* Artwork-driven background: accent-colour wash (no blurred image, no filter: that full-screen blur was the main LCP cost) + dark gradient + accent glow */}
      <div aria-hidden className="absolute inset-0">
        <div className="absolute inset-0" style={{ background: `radial-gradient(140% 90% at 50% 0%, ${accent}59 0%, ${accent}24 45%, transparent 80%), radial-gradient(90% 55% at 100% 100%, ${accent}1a 0%, transparent 70%)` }} />
        <div className="absolute inset-0" style={{ background: `radial-gradient(120% 70% at 50% 0%, ${accent}66 0%, transparent 60%), linear-gradient(180deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,.85) 55%, #000 100%)` }} />
        {themed && (
          <div className="shell-light-layer absolute inset-0" style={{ background: `radial-gradient(120% 70% at 50% 0%, ${accent}59 0%, transparent 60%), linear-gradient(180deg, rgba(250,250,250,.35) 0%, rgba(250,250,250,.9) 55%, #fafafa 100%)` }} />
        )}
      </div>
      <div className="grain absolute inset-0" aria-hidden />

      <div className={cn("relative mx-auto flex w-full max-w-md flex-col px-5 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))]", preview ? "h-full" : "min-h-dvh")}>
        {children}
        {footer !== undefined && <div className="mt-auto pt-10 text-center text-xs text-white/40">{footer}</div>}
      </div>

      {pixels && !preview && <Pixels meta={pixels.meta} tiktok={pixels.tiktok} ga4={pixels.ga4} contentName={pixels.contentName} />}
    </main>
  );
}

/** Artwork + title block. Square for releases, circle for bio/artist pages. */
export function ArtworkHero({
  imageUrl,
  accentColor,
  alt,
  shape = "square",
  compact = false,
  priority = !compact,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  imageUrl: string;
  accentColor: string | null | undefined;
  alt: string;
  shape?: "square" | "circle";
  /** Smaller artwork, used only by the admin mini-previews. */
  compact?: boolean;
  /** The cover is the LCP element on public pages: fetch it first. Off for admin mini-previews. */
  priority?: boolean;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const accent = accentColor || DEFAULT_ACCENT;
  return (
    <>
      <div className={cn("mx-auto w-full", shape === "circle" ? (compact ? "max-w-[128px]" : "max-w-[168px]") : compact ? "max-w-[210px]" : "max-w-[320px]")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={alt}
          fetchPriority={priority ? "high" : undefined}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className={cn("aspect-square w-full object-cover shadow-2xl ring-1 ring-white/10", shape === "circle" ? "rounded-full" : "rounded-2xl")}
          style={{ boxShadow: `0 30px 80px -20px ${accent}99` }}
        />
      </div>
      <div className="mt-6 text-center">
        {eyebrow && <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/60">{eyebrow}</p>}
        <h1 className={cn("text-balance text-3xl font-bold tracking-tight", eyebrow && "mt-2")}>{title}</h1>
        {subtitle && <p className="mt-1 text-lg text-white/75">{subtitle}</p>}
        {children}
      </div>
    </>
  );
}

/** Glassmorphism link card — the same button used on smart links and pre-save pages. */
export function GlassLink({
  href,
  platform,
  label,
  action,
  icon,
  track = true,
  kind,
}: {
  href: string;
  platform: string;
  label?: string | null;
  /** Custom button text; falls back to the platform default (Play / Buy / …). */
  action?: string | null;
  /** Monogram override for the icon tile. */
  icon?: string | null;
  track?: boolean;
  kind?: "presave";
}) {
  const m = platformMeta(platform);
  return (
    <a
      href={href}
      data-track={track ? platform : undefined}
      data-kind={kind}
      className="glass group flex items-center gap-3 rounded-2xl p-2.5 pr-3 transition hover:bg-white/[0.12] active:scale-[0.99]"
    >
      <PlatformIcon platform={platform} icon={icon} />
      <span className="flex-1 truncate font-medium">{label || m.name}</span>
      <span className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black transition group-hover:bg-white/90">{action || m.action}</span>
    </a>
  );
}

export function ShellFooter({ showBranding, orgName }: { showBranding: boolean; orgName: string }) {
  return (
    <div className="space-y-2">
      {showBranding ? (
        <a href="https://droplr.fm" className="inline-flex items-center gap-1.5 hover:text-white/70">
          <Image src="/logo/icon.png" alt="" width={16} height={16} className="shell-logo h-4 w-4 opacity-60 brightness-0 invert" />
          Powered by droplr.fm
        </a>
      ) : (
        <span>{orgName}</span>
      )}
      {/* Fan-facing notices. Absolute URLs: these pages also render on labels' custom domains. White-label pages keep them too. */}
      <nav aria-label="Legal" className="flex justify-center gap-3 text-[11px] text-white/30">
        <a href={`${SITE_URL}/legal/privacy`} className="hover:text-white/60">Privacy</a>
        <a href={`${SITE_URL}/legal/cookies`} className="hover:text-white/60">Cookies</a>
        <a href={`${SITE_URL}/legal/copyright#report`} className="hover:text-white/60">Report</a>
      </nav>
    </div>
  );
}
