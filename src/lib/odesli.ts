// Link resolution without Odesli.
// The Songlink/Odesli public API was discontinued on 2026-07-31, so nothing here calls api.song.link.
// Apple Music comes from the iTunes Lookup API and Deezer from Deezer's public API — both free, no key,
// and both work from Netlify functions. They only find music that is already live in those stores.
// (File name kept so existing imports and history stay easy to follow.)
import type { SpotifyCreds, SpotifyRef } from "./spotify";
import { fetchSpotifyMetadata, parseSpotifyRef } from "./spotify";

export type StoreResolution = {
  appleMusic?: string;
  deezer?: string;
  deezerAlbumId?: string;
  title?: string;
  artist?: string;
  artwork?: string;
  /** which lookups returned something, for logs/UI */
  sources: string[];
};

const TIMEOUT = 8000;

export function normaliseUpc(v: string | null | undefined) {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length >= 12 && d.length <= 14 ? d : null;
}

export function normaliseIsrc(v: string | null | undefined) {
  const c = (v ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(c) ? c : null;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** iTunes returns ...?uo=4 tracking params and 100px artwork; clean both up. */
function cleanAppleUrl(u: string | undefined) {
  if (!u) return undefined;
  try {
    const url = new URL(u);
    url.searchParams.delete("uo");
    url.hostname = url.hostname.replace("itunes.apple.com", "music.apple.com");
    return url.toString();
  } catch {
    return u;
  }
}
const bigArtwork = (u: string | undefined) => u?.replace(/\/\d+x\d+bb\./, "/1000x1000bb.");

type ItunesResult = { wrapperType?: string; kind?: string; collectionViewUrl?: string; trackViewUrl?: string; collectionName?: string; trackName?: string; artistName?: string; artworkUrl100?: string };

/** iTunes Lookup: try the AU storefront first (Rhythm Revolt's home market), then US. */
async function itunesLookup(param: "upc" | "isrc", value: string) {
  for (const country of ["AU", "US"]) {
    const j = await getJson<{ resultCount: number; results: ItunesResult[] }>(`https://itunes.apple.com/lookup?${param}=${encodeURIComponent(value)}&country=${country}`);
    if (j?.resultCount && j.results[0]) return j.results[0];
  }
  return null;
}

type DeezerAlbum = { id?: number; link?: string; title?: string; artist?: { name?: string }; cover_xl?: string; error?: unknown };
type DeezerTrack = { id?: number; link?: string; title?: string; artist?: { name?: string }; album?: { id?: number; cover_xl?: string }; error?: unknown };

export async function resolveFromUPC(upcInput: string): Promise<StoreResolution> {
  const upc = normaliseUpc(upcInput);
  const out: StoreResolution = { sources: [] };
  if (!upc) return out;

  const [apple, deezer] = await Promise.all([
    itunesLookup("upc", upc),
    getJson<DeezerAlbum>(`https://api.deezer.com/album/upc:${upc}`),
  ]);

  if (apple?.collectionViewUrl) {
    out.appleMusic = cleanAppleUrl(apple.collectionViewUrl);
    out.title = apple.collectionName;
    out.artist = apple.artistName;
    out.artwork = bigArtwork(apple.artworkUrl100);
    out.sources.push("itunes:upc");
  }
  if (deezer && !deezer.error && deezer.link) {
    out.deezer = deezer.link;
    out.deezerAlbumId = deezer.id ? String(deezer.id) : undefined;
    out.title ??= deezer.title;
    out.artist ??= deezer.artist?.name;
    out.artwork ??= deezer.cover_xl;
    out.sources.push("deezer:upc");
  }
  return out;
}

export async function resolveFromISRC(isrcInput: string): Promise<StoreResolution> {
  const isrc = normaliseIsrc(isrcInput);
  const out: StoreResolution = { sources: [] };
  if (!isrc) return out;

  const [apple, deezer] = await Promise.all([
    itunesLookup("isrc", isrc), // not in Apple's published docs, so treat as best-effort
    getJson<DeezerTrack>(`https://api.deezer.com/track/isrc:${isrc}`),
  ]);

  if (apple && (apple.trackViewUrl || apple.collectionViewUrl)) {
    out.appleMusic = cleanAppleUrl(apple.trackViewUrl ?? apple.collectionViewUrl);
    out.title = apple.trackName ?? apple.collectionName;
    out.artist = apple.artistName;
    out.artwork = bigArtwork(apple.artworkUrl100);
    out.sources.push("itunes:isrc");
  }
  if (deezer && !deezer.error && deezer.link) {
    out.deezer = deezer.link;
    out.deezerAlbumId = deezer.album?.id ? String(deezer.album.id) : undefined;
    out.title ??= deezer.title;
    out.artist ??= deezer.artist?.name;
    out.artwork ??= deezer.album?.cover_xl;
    out.sources.push("deezer:isrc");
  }
  return out;
}

/** UPC first (album-level links), then fill gaps from ISRC. */
export async function resolveStores(ids: { upc?: string | null; isrc?: string | null }): Promise<StoreResolution & { via: { appleMusic?: string; deezer?: string } }> {
  const via: { appleMusic?: string; deezer?: string } = {};
  const merged: StoreResolution = { sources: [] };
  if (ids.upc && normaliseUpc(ids.upc)) {
    const r = await resolveFromUPC(ids.upc);
    Object.assign(merged, { ...r, sources: [...merged.sources, ...r.sources] });
    if (r.appleMusic) via.appleMusic = `UPC ${normaliseUpc(ids.upc)}`;
    if (r.deezer) via.deezer = `UPC ${normaliseUpc(ids.upc)}`;
  }
  if ((!merged.appleMusic || !merged.deezer) && ids.isrc && normaliseIsrc(ids.isrc)) {
    const r = await resolveFromISRC(ids.isrc);
    if (!merged.appleMusic && r.appleMusic) {
      merged.appleMusic = r.appleMusic;
      via.appleMusic = `ISRC ${normaliseIsrc(ids.isrc)}`;
    }
    if (!merged.deezer && r.deezer) {
      merged.deezer = r.deezer;
      merged.deezerAlbumId = r.deezerAlbumId;
      via.deezer = `ISRC ${normaliseIsrc(ids.isrc)}`;
    }
    merged.title ??= r.title;
    merged.artist ??= r.artist;
    merged.artwork ??= r.artwork;
    merged.sources.push(...r.sources);
  }
  return { ...merged, via };
}

/** Spotify only: title, artist, artwork (+ UPC/ISRC when Spotify includes external_ids). No Odesli. */
export async function resolveFromSpotifyUri(input: string | SpotifyRef, creds: Pick<SpotifyCreds, "clientId" | "clientSecret"> | null) {
  const ref = typeof input === "string" ? parseSpotifyRef(input) : input;
  if (!ref || ref.type === "artist") return null;
  const meta = await fetchSpotifyMetadata(ref, creds).catch(() => null);
  if (!meta) return null;
  return {
    title: meta.title,
    artist: "artistName" in meta ? meta.artistName : undefined,
    artwork: meta.coverUrl,
    artistId: "artistId" in meta ? meta.artistId : undefined,
    albumId: "albumId" in meta ? meta.albumId : ref.type === "album" ? ref.id : undefined,
    trackId: ref.type === "track" ? ref.id : undefined,
    upc: "upc" in meta ? meta.upc : undefined,
    isrc: "isrc" in meta ? meta.isrc : undefined,
  };
}
