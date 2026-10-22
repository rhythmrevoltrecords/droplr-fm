import type { SocialKey } from "@/lib/artist-fields";
import { readableTextOn } from "@/lib/bio-themes";
import type { IconStyle } from "@/lib/page-look";
import { PLATFORM_LOGOS } from "@/lib/platform-logos";
import { platformMeta } from "@/lib/platforms";

export type SocialIcon = { key: SocialKey; label: string; href: string };

/**
 * The row of social icons under a name: a bio page under the artist's name, a release or download
 * page under the artist line. One component so the pages can never drift into different looks.
 *
 * Four styles, chosen on the page's look:
 *  - plain (the default, and the row as it always was): each mark in the page's text colour, so the
 *    row reads as part of the name and Paper's light-theme rules flip it like any other text;
 *  - brand: each network's own colour. White marks (X, Threads) go black on a light page, which their
 *    guidelines allow, rather than vanishing;
 *  - outline: the mark and a ring round it, in the chosen colour (the text colour unless picked);
 *  - solid: a filled circle in the chosen colour with the mark cut out in black or white, whichever
 *    reads on it.
 *
 * The marks themselves are never redrawn or stretched: outline and solid frame them, they don't
 * trace them. Each href is droplr's counted redirect, never the profile address (lib/bio-socials).
 */
export function SocialIcons({
  icons, preview = false, className = "mt-4", iconStyle = "plain", color = null, light = false,
}: {
  icons: SocialIcon[];
  preview?: boolean;
  className?: string;
  iconStyle?: IconStyle;
  /** The chosen colour for outline and solid. Null = the page's text colour. */
  color?: string | null;
  /** The page is light (Paper), so a white brand mark needs to go dark. */
  light?: boolean;
}) {
  if (icons.length === 0) return null;
  const framed = iconStyle === "outline" || iconStyle === "solid";
  return (
    <ul className={`mx-auto flex max-w-sm flex-wrap items-center justify-center ${framed ? "gap-3" : "gap-x-4 gap-y-3"} ${className}`} aria-label="Socials">
      {icons.map((s) => {
        const logo = PLATFORM_LOGOS[s.key as keyof typeof PLATFORM_LOGOS];
        let brand = platformMeta(s.key).color;
        if (light && /^#f{6}$/i.test(brand)) brand = "#0a0a0a";
        const style: React.CSSProperties =
          iconStyle === "brand" ? { color: brand }
          : iconStyle === "outline" ? { color: color ?? undefined, borderColor: color ?? "currentColor" }
          : iconStyle === "solid" && color ? { backgroundColor: color, color: readableTextOn(color) }
          : {};
        const shape =
          iconStyle === "outline" ? "h-10 w-10 rounded-full border-[1.5px]"
          : iconStyle === "solid" ? "h-10 w-10 rounded-full"
          : "h-8 w-8";
        // Solid with no colour anywhere (no icon colour, no text colour) fills with the theme's own
        // ink and cuts the mark out in the opposite, so it reads on both dark themes and Paper.
        const solidDefault = iconStyle === "solid" && !color;
        return (
          <li key={s.key}>
            <a
              href={preview ? undefined : s.href}
              aria-label={s.label}
              title={s.label}
              style={style}
              className={`grid place-items-center transition hover:scale-110 ${shape} ${iconStyle === "plain" ? "text-white/85 hover:text-white" : ""} ${solidDefault ? (light ? "bg-[#0a0a0a] text-white" : "bg-white text-black") : ""}`}
            >
              {logo ? (
                <svg viewBox="0 0 24 24" className={framed ? "h-[18px] w-[18px]" : "h-[22px] w-[22px]"} fill="currentColor" aria-hidden focusable="false"><path d={logo.path} /></svg>
              ) : (
                <span className="text-sm font-bold" aria-hidden>{s.label[0]}</span>
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
