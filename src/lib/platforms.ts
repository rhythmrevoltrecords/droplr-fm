export type PlatformKey =
  | "spotify" | "appleMusic" | "itunes" | "youtubeMusic" | "youtube" | "amazonMusic" | "deezer" | "tidal"
  | "pandora" | "soundcloud" | "tiktokSound" | "beatport" | "traxsource" | "bandcamp" | "audius" | "juno"
  | "napster" | "custom";

export type PlatformMeta = {
  key: PlatformKey;
  name: string;
  /** "Play" for streaming, "Buy" for stores, "Download" for DJ stores */
  action: string;
  kind: "stream" | "store" | "social";
  color: string;
  monogram: string;
  /** default sort weight — DJ/stores sit right next to the majors on purpose */
  weight: number;
  urlPattern?: RegExp;
};

export const PLATFORMS: Record<PlatformKey, PlatformMeta> = {
  spotify: { key: "spotify", name: "Spotify", action: "Play", kind: "stream", color: "#1ED760", monogram: "S", weight: 10, urlPattern: /open\.spotify\.com|spotify:/ },
  appleMusic: { key: "appleMusic", name: "Apple Music", action: "Play", kind: "stream", color: "#FA2D48", monogram: "A", weight: 20, urlPattern: /music\.apple\.com/ },
  beatport: { key: "beatport", name: "Beatport", action: "Buy", kind: "store", color: "#A5F230", monogram: "B", weight: 30, urlPattern: /beatport\.com/ },
  traxsource: { key: "traxsource", name: "Traxsource", action: "Buy", kind: "store", color: "#3FA9F5", monogram: "T", weight: 40, urlPattern: /traxsource\.com/ },
  bandcamp: { key: "bandcamp", name: "Bandcamp", action: "Buy", kind: "store", color: "#1DA0C3", monogram: "B", weight: 50, urlPattern: /bandcamp\.com/ },
  youtubeMusic: { key: "youtubeMusic", name: "YouTube Music", action: "Play", kind: "stream", color: "#FF0033", monogram: "Y", weight: 60, urlPattern: /music\.youtube\.com/ },
  soundcloud: { key: "soundcloud", name: "SoundCloud", action: "Play", kind: "stream", color: "#FF5500", monogram: "S", weight: 70, urlPattern: /soundcloud\.com/ },
  juno: { key: "juno", name: "Juno Download", action: "Buy", kind: "store", color: "#F6C700", monogram: "J", weight: 80, urlPattern: /junodownload\.com|juno\.co\.uk/ },
  amazonMusic: { key: "amazonMusic", name: "Amazon Music", action: "Play", kind: "stream", color: "#25D1DA", monogram: "A", weight: 90, urlPattern: /music\.amazon/ },
  deezer: { key: "deezer", name: "Deezer", action: "Play", kind: "stream", color: "#A238FF", monogram: "D", weight: 100, urlPattern: /deezer\.com/ },
  tidal: { key: "tidal", name: "TIDAL", action: "Play", kind: "stream", color: "#FFFFFF", monogram: "T", weight: 110, urlPattern: /tidal\.com/ },
  audius: { key: "audius", name: "Audius", action: "Play", kind: "stream", color: "#CC0FE0", monogram: "A", weight: 120, urlPattern: /audius\.co/ },
  youtube: { key: "youtube", name: "YouTube", action: "Watch", kind: "stream", color: "#FF0000", monogram: "Y", weight: 130, urlPattern: /youtube\.com|youtu\.be/ },
  itunes: { key: "itunes", name: "iTunes Store", action: "Buy", kind: "store", color: "#EA4CC0", monogram: "i", weight: 140 },
  tiktokSound: { key: "tiktokSound", name: "TikTok Sound", action: "Use", kind: "social", color: "#25F4EE", monogram: "T", weight: 150, urlPattern: /tiktok\.com/ },
  pandora: { key: "pandora", name: "Pandora", action: "Play", kind: "stream", color: "#3668FF", monogram: "P", weight: 160, urlPattern: /pandora\.com/ },
  napster: { key: "napster", name: "Napster", action: "Play", kind: "stream", color: "#2259FF", monogram: "N", weight: 170, urlPattern: /napster\.com/ },
  custom: { key: "custom", name: "Link", action: "Open", kind: "store", color: "#E4E4E7", monogram: "↗", weight: 999 },
};

export const PLATFORM_KEYS = Object.keys(PLATFORMS) as PlatformKey[];

/** Platforms an admin adds by hand (UPC/ISRC lookups only cover Apple Music and Deezer). */
export const MANUAL_PLATFORMS: PlatformKey[] = ["beatport", "traxsource", "bandcamp", "juno", "audius", "soundcloud", "tiktokSound", "youtube", "custom"];

export function platformMeta(key: string): PlatformMeta {
  return PLATFORMS[key as PlatformKey] ?? { ...PLATFORMS.custom, name: key };
}

export function isPlatformKey(key: string): key is PlatformKey {
  return key in PLATFORMS;
}

export function guessPlatformFromUrl(url: string): PlatformKey {
  for (const p of Object.values(PLATFORMS)) if (p.urlPattern?.test(url)) return p.key;
  return "custom";
}

/** Suggested button labels. Any text is allowed. */
export const BUTTON_TEXT_PRESETS = ["Play", "Buy", "Open", "Listen", "Watch", "Download", "Tickets", "Follow", "Locked"];

/** One-tap custom buttons for dance labels (title + button text prefilled). */
export const CUSTOM_BUTTON_PRESETS = [
  { title: "Merch & Vinyl", buttonText: "Buy" },
  { title: "Dubplate Download", buttonText: "Download" },
  { title: "Tickets", buttonText: "Tickets" },
  { title: "Stems & Remix Pack", buttonText: "Download" },
];
