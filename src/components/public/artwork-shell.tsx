import Image from "next/image";
import { SITE_URL } from "@/lib/env";
import { platformMeta } from "@/lib/platforms";
import { posterFill, readableTextOn } from "@/lib/bio-themes";
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
  skin,
  glow = true,
  background,
  glowColor,
  buttonColor,
  textColor,
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
  /** Extra classes for a per-page look (bio themes + font). Styling only: no layout changes. */
  skin?: string;
  /** Mono drops the accent wash. Nothing else turns the glow off, so it defaults to on. */
  glow?: boolean;
  /**
   * Whole-page background chosen by the page's owner. The image wins when both are set.
   *
   * Painted UNDER the accent wash and always under a scrim, so there is no upload that can make
   * the links unreadable — the one failure mode a free-form background has. Never blurred: a
   * full-screen blur was measured as the main LCP cost on these pages and removed once already.
   */
  background?: { url?: string | null; color?: string | null } | null;
  /** Overrides the accent used for the wash. From the account, like the halo. */
  glowColor?: string | null;
  /**
   * Link button colour for this page. What it does depends on the theme — a glass theme tints
   * its glass, Poster fills solid — so the shell only publishes the values and the skin CSS
   * decides. Poster's fill is corrected for contrast before it gets here.
   */
  buttonColor?: string | null;
  /**
   * The page's text colour, when the owner picked one. Published as --page-ink with a `page-ink`
   * class; globals.css applies it to the text and leaves Poster's buttons on their own contrast ink.
   */
  textColor?: string | null;
}) {
  const accent = accentColor || DEFAULT_ACCENT;
  const themed = theme === "light" || theme === "system";
  const bg = !!(background?.url || background?.color);
  const wash = glowColor || accent;
  // Poster fills its buttons solid, so the chosen colour is darkened or lightened until small
  // text clears 4.5:1 on it — the same correction the accent already gets. The glass themes use
  // the raw colour at low alpha, where the page behind it dominates the contrast.
  const fill = buttonColor ? posterFill(buttonColor) : null;
  return (
    <main
      className={cn("relative overflow-hidden bg-black text-white", preview ? "h-full w-full" : "min-h-dvh", themed && `shell-theme-${theme}`, skin, textColor && "page-ink")}
      style={{
        ["--shell-accent" as string]: accent,
        ["--shell-ink" as string]: readableTextOn(fill ?? posterFill(accent)),
        ["--shell-fill" as string]: fill ?? posterFill(accent),
        // Only set when the page chose a colour, so `var(--bubble, …)` falls back to each
        // theme's own treatment rather than every page suddenly having a tint.
        ...(buttonColor ? { ["--bubble" as string]: buttonColor } : {}),
        ...(textColor ? { ["--page-ink" as string]: textColor } : {}),
      }}
    >
      {/* Artwork-driven background: accent-colour wash (no blurred image, no filter: that full-screen blur was the main LCP cost) + dark gradient + accent glow */}
      {bg && (
        <div aria-hidden className="absolute inset-0">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={background?.url ? { backgroundImage: `url(${JSON.stringify(background.url)})` } : { backgroundColor: background?.color ?? undefined }}
          />
          {/* The guarantee. Strength is per theme (see .bio-bg-scrim in globals.css), and it sits
              above the image so nothing an artist uploads can take the text with it. */}
          <div className="bio-bg-scrim absolute inset-0" />
        </div>
      )}
      <div aria-hidden className="absolute inset-0">
        {glow && <div className="absolute inset-0" style={{ background: `radial-gradient(140% 90% at 50% 0%, ${wash}59 0%, ${wash}24 45%, transparent 80%), radial-gradient(90% 55% at 100% 100%, ${wash}1a 0%, transparent 70%)` }} />}
        {/* With a background set, this layer stops being the page's colour and becomes a light
            wash over it — otherwise the opaque black ramp would hide what the artist uploaded. */}
        <div className="absolute inset-0" style={{ background: bg
          ? (glow ? `radial-gradient(120% 70% at 50% 0%, ${wash}40 0%, transparent 60%)` : "transparent")
          : glow ? `radial-gradient(120% 70% at 50% 0%, ${wash}66 0%, transparent 60%), linear-gradient(180deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,.85) 55%, #000 100%)` : "#000" }} />
        {themed && (
          /* The light treatment paints its own accent radial, so it has to honour the glow
             switch too. It did not, which is why turning the glow off cleared every dark theme
             and left Paper glowing. */
          <div className="shell-light-layer absolute inset-0" style={{ background: glow
            ? `radial-gradient(120% 70% at 50% 0%, ${wash}59 0%, transparent 60%), linear-gradient(180deg, rgba(250,250,250,.35) 0%, rgba(250,250,250,.9) 55%, #fafafa 100%)`
            : "linear-gradient(180deg, rgba(250,250,250,.35) 0%, rgba(250,250,250,.9) 55%, #fafafa 100%)" }} />
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
  glowColor,
  glow = true,
  children,
}: {
  imageUrl: string;
  accentColor: string | null | undefined;
  /** Overrides the colour of the halo. Null/undefined keeps the one extracted from the image. */
  glowColor?: string | null;
  /** False removes the halo. The account-level switch, not a theme decision. */
  glow?: boolean;
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
  // The halo behind the artwork or avatar. glowColor overrides the colour pulled from the image;
  // glow={false} removes it entirely. Both come from the account (Organization.publicGlow /
  // glowColor), so a release page and a bio page never disagree about the look.
  const halo = glowColor || accent;
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
          style={glow ? { boxShadow: `0 30px 80px -20px ${halo}99` } : undefined}
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
  iconUrl,
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
  /** Uploaded square image, for a link with no platform mark of its own. */
  iconUrl?: string | null;
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
      <PlatformIcon platform={platform} icon={icon} iconUrl={iconUrl} />
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
