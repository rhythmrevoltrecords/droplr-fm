import { bioReleaseAction, bioReleaseEyebrow, type BioReleaseState } from "@/lib/bio-release";
import { bioFontOf, bioSkinClass, bioThemeHasGlow, bioThemeIsLight, bioThemeOf } from "@/lib/bio-themes";
import { ArtworkHero, ArtworkPageShell, GlassLink, ShellFooter, type PublicTheme, type ShellPixels } from "./artwork-shell";
import { bioFontClass } from "./bio-fonts";

export type BioViewData = {
  title: string;
  bio: string | null;
  imageUrl: string;
  accentColor: string | null;
  /** One of BIO_THEMES; anything else (or null) falls back to the default look. */
  theme?: string | null;
  /** One of BIO_FONTS; same fallback. */
  font?: string | null;
  /** The release block, already chosen by lib/bio-release. null when there is nothing to show. */
  release?: {
    state: BioReleaseState;
    title: string;
    artistName: string;
    coverUrl: string;
    releaseDate: Date;
    href: string;
  } | null;
  links: { id: string; platform: string; label: string | null; buttonText?: string | null; icon?: string | null }[];
};

/** Bio link page: same artwork shell + glass links as release pages, with a circular avatar. */
export function BioView({ page, orgName, showBranding, pixels, preview = false, theme = "dark", timezone }: { page: BioViewData; orgName: string; showBranding: boolean; pixels?: ShellPixels | null; preview?: boolean; theme?: PublicTheme; timezone?: string | null }) {
  const skin = bioThemeOf(page.theme);
  const font = bioFontOf(page.font);
  // Paper is the light shell treatment. The org-wide theme preference still wins
  // when it asks for light or system: that switch is the label's, this one is the page's.
  const shellTheme: PublicTheme = bioThemeIsLight(skin) && theme === "dark" ? "light" : theme;
  return (
    <ArtworkPageShell
      preview={preview}
      theme={shellTheme}
      skin={`${bioSkinClass(skin)} ${bioFontClass(font)}`}
      glow={bioThemeHasGlow(skin)}
      imageUrl={page.imageUrl}
      accentColor={page.accentColor}
      footer={<ShellFooter showBranding={showBranding} orgName={orgName} />}
      pixels={pixels}
    >
      <ArtworkHero imageUrl={page.imageUrl} accentColor={page.accentColor} alt={page.title} shape="circle" title={page.title}>
        {page.bio && <p className="mx-auto mt-2 max-w-sm whitespace-pre-line text-balance text-[15px] leading-relaxed text-white/70">{page.bio}</p>}
      </ArtworkHero>
      {page.release && (
        /* Nobody maintains this block: it reads the release record droplr already holds. It sits
           above the links because on release week it is the reason the page was opened. */
        <a
          href={preview ? undefined : page.release.href}
          className="glass mt-7 flex items-center gap-3 rounded-2xl p-3 transition hover:scale-[1.01]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={page.release.coverUrl} alt="" loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-white/10" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-white/60">
              {bioReleaseEyebrow(page.release.state, page.release.releaseDate, timezone)}
            </span>
            <span className="block truncate text-[15px] font-semibold">{page.release.title}</span>
            <span className="block truncate text-xs text-white/60">{page.release.artistName}</span>
          </span>
          <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black">
            {bioReleaseAction(page.release.state)}
          </span>
        </a>
      )}
      <ul className="mt-7 space-y-2.5">
        {page.links.map((l) => (
          <li key={l.id}>
            <GlassLink href={preview ? "#" : `/api/b/${l.id}`} platform={l.platform} label={l.label} action={l.buttonText} icon={l.icon} track={!preview} />
          </li>
        ))}
        {page.links.length === 0 && <li className="glass rounded-2xl p-4 text-center text-sm text-white/70">Links coming soon.</li>}
      </ul>
    </ArtworkPageShell>
  );
}
