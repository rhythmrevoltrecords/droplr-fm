import { ArtworkHero, ArtworkPageShell, GlassLink, ShellFooter, type PublicTheme, type ShellPixels } from "./artwork-shell";

export type BioViewData = {
  title: string;
  bio: string | null;
  imageUrl: string;
  accentColor: string | null;
  links: { id: string; platform: string; label: string | null; buttonText?: string | null; icon?: string | null }[];
};

/** Bio link page: same artwork shell + glass links as release pages, with a circular avatar. */
export function BioView({ page, orgName, showBranding, pixels, preview = false, theme = "dark" }: { page: BioViewData; orgName: string; showBranding: boolean; pixels?: ShellPixels | null; preview?: boolean; theme?: PublicTheme }) {
  return (
    <ArtworkPageShell
      preview={preview}
      theme={theme}
      imageUrl={page.imageUrl}
      accentColor={page.accentColor}
      footer={<ShellFooter showBranding={showBranding} orgName={orgName} />}
      pixels={pixels}
    >
      <ArtworkHero imageUrl={page.imageUrl} accentColor={page.accentColor} alt={page.title} shape="circle" title={page.title}>
        {page.bio && <p className="mx-auto mt-2 max-w-sm whitespace-pre-line text-balance text-[15px] leading-relaxed text-white/70">{page.bio}</p>}
      </ArtworkHero>
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
