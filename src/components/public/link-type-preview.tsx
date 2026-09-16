import { previewArtwork, type LinkType } from "@/lib/link-types";
import { ArtworkHero, ArtworkPageShell, GlassLink } from "./artwork-shell";

/**
 * Miniature of a real public page, built from the same ArtworkPageShell / ArtworkHero / GlassLink
 * pieces the live pages use. Rendered at phone size (390×560) and scaled down by the caller.
 */
export function LinkTypePreview({ type }: { type: LinkType }) {
  const img = previewArtwork(type);
  const accent = type.preview.a;
  const artist = type.artwork === "artist";

  const hero = (eyebrow: string | undefined, title: string, subtitle?: string) => (
    <ArtworkHero imageUrl={img} accentColor={accent} alt="" shape={artist ? "circle" : "square"} compact eyebrow={eyebrow} title={title} subtitle={subtitle} />
  );
  const links = (items: { platform: string; label?: string; action?: string }[]) => (
    <ul className="mt-6 space-y-2.5">
      {items.map((i, n) => (
        <li key={n}><GlassLink href="#" track={false} platform={i.platform} label={i.label} action={i.action} /></li>
      ))}
    </ul>
  );
  const glassButton = (label: string) => (
    <div className="glass mt-6 space-y-3 rounded-2xl p-4">
      <div className="h-11 rounded-xl border border-white/15 bg-black/40" />
      <div className="flex h-11 items-center justify-center rounded-xl bg-white text-sm font-semibold text-black">{label}</div>
    </div>
  );
  const countdown = (
    <div className="mt-6 grid grid-cols-4 gap-2">
      {["12", "07", "24", "44"].map((v, i) => (
        <div key={i} className="glass rounded-xl py-3 text-center"><div className="text-2xl font-semibold tabular-nums">{v}</div></div>
      ))}
    </div>
  );

  let body: React.ReactNode;
  switch (type.key) {
    case "presave":
      body = <>{hero("Out 3 Oct", "Night Bus Dubplate", "OTOTO")}{countdown}{glassButton("Pre-save with email")}</>;
      break;
    case "smartlink":
      body = <>{hero("Out now", "Two Step Theory", "OTOTO")}{links([{ platform: "spotify" }, { platform: "beatport" }, { platform: "bandcamp" }])}</>;
      break;
    case "bio":
      body = <>{hero(undefined, "OTOTO", "UK garage · Brisbane")}{links([{ platform: "spotify", label: "New single" }, { platform: "custom", label: "Tour dates" }, { platform: "bandcamp", label: "Merch" }])}</>;
      break;
    case "futuresave":
      body = <>{hero("Never miss a drop", "OTOTO", "Save every future release")}{glassButton("Follow future releases")}</>;
      break;
    case "shortlink":
      body = <>{hero(undefined, "Tickets on sale", "rrr.fm/launch")}{links([{ platform: "custom", label: "Open link" }])}</>;
      break;
    case "tour":
      body = <>{hero("On tour", "OTOTO Live", "2026")}{links([{ platform: "custom", label: "Sat 12 Oct · Brisbane", action: "Tickets" }, { platform: "custom", label: "Fri 18 Oct · Sydney", action: "Tickets" }, { platform: "custom", label: "Sat 26 Oct · Melbourne", action: "Tickets" }])}</>;
      break;
    case "action":
      body = <>{hero("Exclusive", "Dubplate Download", "Follow to unlock")}{links([{ platform: "spotify", label: "Follow OTOTO", action: "Follow" }, { platform: "custom", label: "Download", action: "Locked" }])}</>;
      break;
    case "contest":
      body = <>{hero("Giveaway", "Win a signed vinyl", "Ends Friday")}{glassButton("Enter to win")}</>;
      break;
    case "podcast":
      body = <>{hero("Episode 12", "Rhythm Revolt Radio", "Mix series")}{links([{ platform: "spotify" }, { platform: "appleMusic", label: "Apple Podcasts" }, { platform: "youtube" }])}</>;
      break;
    case "scheduled":
      body = <>{hero("Goes live Fri 00:00", "Scheduled drop", "OTOTO")}{countdown}</>;
      break;
  }

  return (
    <ArtworkPageShell preview imageUrl={img} accentColor={accent}>
      {body}
    </ArtworkPageShell>
  );
}
