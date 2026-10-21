import type { SocialKey } from "@/lib/artist-fields";
import { PLATFORM_LOGOS } from "@/lib/platform-logos";

export type SocialIcon = { key: SocialKey; label: string; href: string };

/**
 * The row of social icons under a name: a bio page under the artist's name, a release page under
 * the artist line. One component so the two pages can never drift into two looks.
 *
 * One colour, the page's own text colour, so the row reads as part of the name rather than as a
 * second set of buttons, and Paper's light-theme rules flip it like every other text-white class.
 * Each href is droplr's counted redirect, never the profile address itself (lib/bio-socials).
 */
export function SocialIcons({ icons, preview = false, className = "mt-4" }: { icons: SocialIcon[]; preview?: boolean; className?: string }) {
  if (icons.length === 0) return null;
  return (
    <ul className={`mx-auto flex max-w-sm flex-wrap items-center justify-center gap-x-4 gap-y-3 ${className}`} aria-label="Socials">
      {icons.map((s) => {
        const logo = PLATFORM_LOGOS[s.key as keyof typeof PLATFORM_LOGOS];
        return (
          <li key={s.key}>
            <a href={preview ? undefined : s.href} aria-label={s.label} title={s.label} className="grid h-8 w-8 place-items-center text-white/85 transition hover:scale-110 hover:text-white">
              {logo ? (
                <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden focusable="false"><path d={logo.path} /></svg>
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
