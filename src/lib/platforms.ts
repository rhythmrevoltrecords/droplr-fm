export type PlatformKey =
  | "spotify" | "appleMusic" | "itunes" | "youtubeMusic" | "youtube" | "amazonMusic" | "deezer" | "tidal"
  | "pandora" | "soundcloud" | "tiktokSound" | "beatport" | "traxsource" | "bandcamp" | "audius" | "juno"
  | "napster" | "iheartRadio" | "audiomack" | "qobuz" | "anghami" | "boomplay" | "custom";

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
  /** Anchored, and matched against the parsed hostname — never against the whole URL. */
  hostPattern?: RegExp;
};

export const PLATFORMS: Record<PlatformKey, PlatformMeta> = {
  spotify: { key: "spotify", name: "Spotify", action: "Play", kind: "stream", color: "#1ED760", monogram: "S", weight: 10, hostPattern: /^open\.spotify\.com$/ },
  appleMusic: { key: "appleMusic", name: "Apple Music", action: "Play", kind: "stream", color: "#FA2D48", monogram: "A", weight: 20, hostPattern: /^music\.apple\.com$/ },
  beatport: { key: "beatport", name: "Beatport", action: "Buy", kind: "store", color: "#A5F230", monogram: "B", weight: 30, hostPattern: /^(www\.)?beatport\.com$/ },
  traxsource: { key: "traxsource", name: "Traxsource", action: "Buy", kind: "store", color: "#3FA9F5", monogram: "T", weight: 40, hostPattern: /^(www\.)?traxsource\.com$/ },
  bandcamp: { key: "bandcamp", name: "Bandcamp", action: "Buy", kind: "store", color: "#1DA0C3", monogram: "B", weight: 50, hostPattern: /(^|\.)bandcamp\.com$/ },
  youtubeMusic: { key: "youtubeMusic", name: "YouTube Music", action: "Play", kind: "stream", color: "#FF0033", monogram: "Y", weight: 60, hostPattern: /^music\.youtube\.com$/ },
  soundcloud: { key: "soundcloud", name: "SoundCloud", action: "Play", kind: "stream", color: "#FF5500", monogram: "S", weight: 70, hostPattern: /^(www\.|m\.)?soundcloud\.com$/ },
  juno: { key: "juno", name: "Juno Download", action: "Buy", kind: "store", color: "#F6C700", monogram: "J", weight: 80, hostPattern: /^(www\.)?(junodownload\.com|juno\.co\.uk)$/ },
  amazonMusic: { key: "amazonMusic", name: "Amazon Music", action: "Play", kind: "stream", color: "#25D1DA", monogram: "A", weight: 90, hostPattern: /^music\.amazon\.[a-z.]{2,7}$/ },
  deezer: { key: "deezer", name: "Deezer", action: "Play", kind: "stream", color: "#A238FF", monogram: "D", weight: 100, hostPattern: /^(www\.)?deezer\.com$/ },
  tidal: { key: "tidal", name: "TIDAL", action: "Play", kind: "stream", color: "#FFFFFF", monogram: "T", weight: 110, hostPattern: /^(www\.|listen\.)?tidal\.com$/ },
  audius: { key: "audius", name: "Audius", action: "Play", kind: "stream", color: "#CC0FE0", monogram: "A", weight: 120, hostPattern: /^(www\.)?audius\.co$/ },
  youtube: { key: "youtube", name: "YouTube", action: "Watch", kind: "stream", color: "#FF0000", monogram: "Y", weight: 130, hostPattern: /^((www\.|m\.|music\.)?youtube\.com|youtu\.be)$/ },
  itunes: { key: "itunes", name: "iTunes Store", action: "Buy", kind: "store", color: "#EA4CC0", monogram: "i", weight: 140 },
  tiktokSound: { key: "tiktokSound", name: "TikTok Sound", action: "Use", kind: "social", color: "#25F4EE", monogram: "T", weight: 150, hostPattern: /^(www\.|m\.)?tiktok\.com$/ },
  pandora: { key: "pandora", name: "Pandora", action: "Play", kind: "stream", color: "#3668FF", monogram: "P", weight: 160, hostPattern: /^(www\.)?pandora\.com$/ },
  napster: { key: "napster", name: "Napster", action: "Play", kind: "stream", color: "#2259FF", monogram: "N", weight: 170, hostPattern: /^(www\.)?napster\.com$/ },
  // Everywhere a DistroKid release actually lands that droplr can link to. Added 28 Sep 2026: a
  // release reaches these whether or not the artist knows it, and a smart link that can't name them
  // sends a fan who uses one to a store they don't.
  iheartRadio: { key: "iheartRadio", name: "iHeartRadio", action: "Play", kind: "stream", color: "#C6002B", monogram: "i", weight: 180, hostPattern: /^(www\.)?iheart\.com$/ },
  audiomack: { key: "audiomack", name: "Audiomack", action: "Play", kind: "stream", color: "#FFA200", monogram: "A", weight: 190, hostPattern: /^(www\.)?audiomack\.com$/ },
  qobuz: { key: "qobuz", name: "Qobuz", action: "Play", kind: "stream", color: "#0070EF", monogram: "Q", weight: 200, hostPattern: /^(www\.|open\.|play\.)?qobuz\.com$/ },
  anghami: { key: "anghami", name: "Anghami", action: "Play", kind: "stream", color: "#FF5E00", monogram: "A", weight: 210, hostPattern: /^(www\.|play\.)?anghami\.com$/ },
  boomplay: { key: "boomplay", name: "Boomplay", action: "Play", kind: "stream", color: "#F25C05", monogram: "B", weight: 220, hostPattern: /^(www\.)?boomplay\.com$/ },
  custom: { key: "custom", name: "Link", action: "Open", kind: "store", color: "#E4E4E7", monogram: "↗", weight: 999 },
};

export const PLATFORM_KEYS = Object.keys(PLATFORMS) as PlatformKey[];

/** Platforms an admin adds by hand (UPC/ISRC lookups only cover Apple Music and Deezer). */
export const MANUAL_PLATFORMS: PlatformKey[] = [
  "beatport", "bandcamp", "soundcloud", "tiktokSound", "youtube",
  "iheartRadio", "audiomack", "qobuz", "anghami", "boomplay",
  // DJ stores: no distributor in the DistroKid mould reaches them, but dance labels get there
  // through Label Worx and Believe, so the link types stay.
  "traxsource", "juno", "audius",
  "custom",
];

/**
 * "Where do you listen?" on the email pre-save. Their pick leads the release-day email.
 *
 * Ordered by how many fans actually use them, and kept short on purpose: this is a question asked
 * of a fan mid-pre-save, not a directory. Juno and Traxsource came off on 28 Sep 2026 — a fan
 * choosing a DJ download store on a pre-save was close to hypothetical, and the space is better
 * spent on the ones a release reaches by default.
 */
export const LISTEN_CHOICES: PlatformKey[] = ["spotify", "appleMusic", "youtubeMusic", "amazonMusic", "soundcloud", "tidal", "deezer", "beatport", "bandcamp", "audiomack", "anghami", "boomplay"];
export const isListenChoice = (v: unknown): v is PlatformKey => typeof v === "string" && (LISTEN_CHOICES as string[]).includes(v);

/** Store search pages, so a label can find a link the lookups can't (no public API: Beatport, Bandcamp, Amazon…). */
export function storeSearchUrl(key: string, query: string): string | null {
  const q = encodeURIComponent(query);
  const urls: Partial<Record<PlatformKey, string>> = {
    spotify: `https://open.spotify.com/search/${q}`,
    appleMusic: `https://music.apple.com/search?term=${q}`,
    beatport: `https://www.beatport.com/search?q=${q}`,
    traxsource: `https://www.traxsource.com/search?term=${q}`,
    bandcamp: `https://bandcamp.com/search?q=${q}`,
    youtubeMusic: `https://music.youtube.com/search?q=${q}`,
    soundcloud: `https://soundcloud.com/search?q=${q}`,
    juno: `https://www.junodownload.com/search/?q%5Ball%5D%5B%5D=${q}`,
    amazonMusic: `https://music.amazon.com/search/${q}`,
    deezer: `https://www.deezer.com/search/${q}`,
    tidal: `https://tidal.com/search?q=${q}`,
    audius: `https://audius.co/search/${q}`,
    youtube: `https://www.youtube.com/results?search_query=${q}`,
    iheartRadio: `https://www.iheart.com/search/?q=${q}`,
    audiomack: `https://audiomack.com/search/${q}`,
    qobuz: `https://www.qobuz.com/us-en/search?q=${q}`,
    anghami: `https://play.anghami.com/search/${q}`,
    boomplay: `https://www.boomplay.com/search/default/${q}`,
  };
  return urls[key as PlatformKey] ?? null;
}

export function platformMeta(key: string): PlatformMeta {
  // Follow-on-Spotify clicks are logged under their own key so analytics can show follows separately.
  if (key === "spotifyFollow") return { ...PLATFORMS.spotify, name: "Spotify follow", action: "Follow" };
  return PLATFORMS[key as PlatformKey] ?? { ...PLATFORMS.custom, name: key };
}

export function isPlatformKey(key: string): key is PlatformKey {
  return key in PLATFORMS;
}

/**
 * Which platform a pasted link belongs to.
 *
 * Matches the parsed hostname against anchored patterns. The earlier version tested
 * unanchored regexes against the whole URL, so https://example.com/open.spotify.com/x
 * was read as Spotify — a link showing the wrong service's name and icon.
 * Object order decides ties, which is why music.youtube.com is listed before youtube.com.
 */
export function guessPlatformFromUrl(url: string): PlatformKey {
  const raw = url.trim();
  if (/^spotify:/i.test(raw)) return "spotify";
  let host: string;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "custom";
    host = u.hostname.toLowerCase();
  } catch {
    return "custom";
  }
  for (const p of Object.values(PLATFORMS)) if (p.hostPattern?.test(host)) return p.key;
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
