export type LinkTypeKey =
  | "presave" | "smartlink" | "bio"
  | "futuresave" | "shortlink" | "tour" | "action" | "contest" | "podcast" | "scheduled";

export type LinkType = {
  key: LinkTypeKey;
  name: string;
  description: string;
  status: "active" | "soon";
  href?: string;
  /** Artwork source used for the preview (and later the real page). */
  artwork: "release" | "artist";
  preview: { a: string; b: string; title: string };
};

export const LINK_TYPES: LinkType[] = [
  { key: "presave", name: "Pre-Save Link", description: "Countdown, email capture and release-day email. Flips to a smart link on drop day.", status: "active", href: "/admin/releases/new?type=presave", artwork: "release", preview: { a: "#7C3AED", b: "#EC4899", title: "Night Bus" } },
  { key: "smartlink", name: "Music Smart Link", description: "Every platform for a released track, with Beatport, Traxsource and Bandcamp up top.", status: "active", href: "/admin/releases/new?type=smartlink", artwork: "release", preview: { a: "#0EA5E9", b: "#22C55E", title: "Two Step" } },
  { key: "bio", name: "Bio Link", description: "One link for your socials: artwork-driven page with all your links.", status: "active", href: "/admin/bio/new", artwork: "artist", preview: { a: "#F59E0B", b: "#DB2777", title: "OTOTO" } },
  { key: "futuresave", name: "Artist Follow", description: "One link to follow the artist on Spotify and every store, plus an email for each new release.", status: "soon", artwork: "artist", preview: { a: "#6366F1", b: "#14B8A6", title: "OTOTO" } },
  { key: "shortlink", name: "Short Link", description: "Branded short URL for anything, with the same tracking and pixels.", status: "soon", artwork: "release", preview: { a: "#64748B", b: "#8B5CF6", title: "Link" } },
  { key: "tour", name: "Tour", description: "Dates and ticket links on a page themed from your artist photo.", status: "soon", artwork: "artist", preview: { a: "#EF4444", b: "#F97316", title: "Live" } },
  { key: "action", name: "Action Page", description: "Unlock a download or exclusive after an email sign-up.", status: "soon", artwork: "release", preview: { a: "#10B981", b: "#3B82F6", title: "Unlock" } },
  { key: "contest", name: "Contest", description: "Giveaways that grow your email list, with entries tracked per source.", status: "soon", artwork: "release", preview: { a: "#EAB308", b: "#A855F7", title: "Win" } },
  { key: "podcast", name: "Podcast", description: "Episode or show link across every podcast app.", status: "soon", artwork: "release", preview: { a: "#8B5CF6", b: "#0EA5E9", title: "Mixtape" } },
  { key: "scheduled", name: "Scheduled Release", description: "Set it once: page, emails and socials go live on the minute.", status: "soon", artwork: "release", preview: { a: "#DB2777", b: "#6366F1", title: "Friday" } },
];

export const COMING_SOON_KEYS = LINK_TYPES.filter((t) => t.status === "soon").map((t) => t.key);

export function previewArtwork(t: Pick<LinkType, "preview">) {
  const q = new URLSearchParams({ title: t.preview.title, a: t.preview.a, b: t.preview.b });
  return `/api/cover-art?${q.toString()}`;
}
