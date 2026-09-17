// Roster profile constants. No server imports: the profile editor (client) uses these too.

export const ARTIST_STATUSES = ["active", "prospect", "alumni"] as const;
export type ArtistStatus = (typeof ARTIST_STATUSES)[number];
export const ARTIST_STATUS_LABELS: Record<ArtistStatus, string> = { active: "Active", prospect: "Prospect", alumni: "Alumni" };
export const isArtistStatus = (s: unknown): s is ArtistStatus => typeof s === "string" && (ARTIST_STATUSES as readonly string[]).includes(s);

export const SOCIAL_KEYS = ["instagram", "tiktok", "spotify", "appleMusic", "soundcloud", "youtube", "bandcamp", "beatport", "x", "facebook"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export type SocialLinks = Partial<Record<SocialKey, string>>;
export const SOCIAL_LABELS: Record<SocialKey, string> = {
  instagram: "Instagram", tiktok: "TikTok", spotify: "Spotify", appleMusic: "Apple Music", soundcloud: "SoundCloud",
  youtube: "YouTube", bandcamp: "Bandcamp", beatport: "Beatport", x: "X (Twitter)", facebook: "Facebook",
};

export const ARTIST_BIO_MAX = 3000;
export const PRESS_PHOTOS_MAX = 8;

/** Json column → known keys with string values only (the column may hold anything written by hand). */
export function readSocialLinks(v: unknown): SocialLinks {
  const out: SocialLinks = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const k of SOCIAL_KEYS) {
    const val = (v as Record<string, unknown>)[k];
    if (typeof val === "string" && val) out[k] = val;
  }
  return out;
}

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
