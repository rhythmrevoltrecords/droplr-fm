import { prisma } from "./db";
import { decrypt } from "./crypto";

export const SPOTIFY_SCOPES = ["user-library-modify", "user-follow-modify", "user-read-email"];

export type SpotifyRef = { type: "album" | "track" | "artist"; id: string };

/** Accepts https://open.spotify.com/(intl-xx/)album/ID?si=…, spotify:album:ID, or a bare 22-char ID (assumed album). */
export function parseSpotifyRef(input: string): SpotifyRef | null {
  const s = input.trim();
  const uri = s.match(/^spotify:(album|track|artist):([A-Za-z0-9]{22})$/);
  if (uri) return { type: uri[1] as SpotifyRef["type"], id: uri[2] };
  const url = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(album|track|artist)\/([A-Za-z0-9]{22})/);
  if (url) return { type: url[1] as SpotifyRef["type"], id: url[2] };
  if (/^[A-Za-z0-9]{22}$/.test(s)) return { type: "album", id: s };
  return null;
}

export const spotifyUrl = (ref: SpotifyRef) => `https://open.spotify.com/${ref.type}/${ref.id}`;

export type SpotifyCreds = { clientId: string; clientSecret: string; source: "byo" | "platform" };

/** BYO first. Platform env app is only used when SPOTIFY_PLATFORM_FALLBACK=true. */
export async function getSpotifyCreds(organizationId: string): Promise<SpotifyCreds | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { spotifyClientIdEncrypted: true, spotifyClientSecretEncrypted: true, spotifyAppStatus: true },
  });
  if (org?.spotifyClientIdEncrypted && org.spotifyClientSecretEncrypted && org.spotifyAppStatus !== "none") {
    return { clientId: decrypt(org.spotifyClientIdEncrypted), clientSecret: decrypt(org.spotifyClientSecretEncrypted), source: "byo" };
  }
  if (process.env.SPOTIFY_PLATFORM_FALLBACK === "true" && process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
    return { clientId: process.env.SPOTIFY_CLIENT_ID, clientSecret: process.env.SPOTIFY_CLIENT_SECRET, source: "platform" };
  }
  return null;
}

function basic(creds: { clientId: string; clientSecret: string }) {
  return "Basic " + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
}

export function spotifyAuthorizeUrl(creds: SpotifyCreds, redirectUri: string, state: string) {
  const u = new URL("https://accounts.spotify.com/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", creds.clientId);
  u.searchParams.set("scope", SPOTIFY_SCOPES.join(" "));
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope: string };

export async function exchangeCode(creds: SpotifyCreds, code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: basic(creds), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });
  if (!res.ok) throw new Error(`Spotify token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(creds: SpotifyCreds, refreshToken: string): Promise<TokenResponse> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: basic(creds), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) throw new SpotifyError(`refresh failed: ${res.status} ${await res.text()}`, res.status);
  return res.json();
}

export async function clientCredentialsToken(creds: { clientId: string; clientSecret: string }) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: basic(creds), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as TokenResponse).access_token;
}

export class SpotifyError extends Error {
  constructor(message: string, public status: number, public retryAfter?: number, public quotaExceeded = false) {
    super(message);
  }
}

async function spotifyFetch(accessToken: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 429) {
    const body = await res.text();
    throw new SpotifyError(`429 ${body}`, 429, Number(res.headers.get("retry-after") ?? "5"), body.includes("QUOTA_EXCEEDED"));
  }
  return res;
}

export async function getMe(accessToken: string) {
  const res = await spotifyFetch(accessToken, "/me");
  if (!res.ok) return null;
  return (await res.json()) as { id: string; email?: string; country?: string };
}

/**
 * Save release + follow artist.
 * Primary: PUT /v1/me/library?uris=… (Feb 2026 consolidated endpoint).
 * Fallback: legacy PUT /me/albums, /me/tracks, /me/following when the new endpoint 404s.
 */
export async function saveToLibrary(accessToken: string, target: { albumId?: string | null; trackId?: string | null; artistId?: string | null }) {
  const uris: string[] = [];
  if (target.albumId) uris.push(`spotify:album:${target.albumId}`);
  else if (target.trackId) uris.push(`spotify:track:${target.trackId}`);
  if (target.artistId) uris.push(`spotify:artist:${target.artistId}`);
  if (!uris.length) throw new SpotifyError("Nothing to save: release has no Spotify album/track ID", 400);

  const res = await spotifyFetch(accessToken, `/me/library?uris=${encodeURIComponent(uris.join(","))}`, { method: "PUT" });
  if (res.ok) return { endpoint: "library" as const };
  if (res.status !== 404 && res.status !== 405) {
    throw new SpotifyError(`PUT /me/library ${res.status} ${await res.text()}`, res.status);
  }

  // Legacy fallback
  if (target.albumId) await legacy(accessToken, `/me/albums?ids=${target.albumId}`);
  else if (target.trackId) await legacy(accessToken, `/me/tracks?ids=${target.trackId}`);
  if (target.artistId) await legacy(accessToken, `/me/following?type=artist&ids=${target.artistId}`);
  return { endpoint: "legacy" as const };
}

async function legacy(accessToken: string, path: string) {
  const res = await spotifyFetch(accessToken, path, { method: "PUT" });
  if (!res.ok && res.status !== 204) throw new SpotifyError(`PUT ${path} ${res.status} ${await res.text()}`, res.status);
}

/** Metadata lookup via client-credentials (works when Odesli can't see an unreleased album). */
export async function fetchSpotifyMetadata(ref: SpotifyRef, creds: { clientId: string; clientSecret: string } | null) {
  // oEmbed needs no credentials — gives title + thumbnail for most public items.
  let title: string | undefined;
  let coverUrl: string | undefined;
  try {
    const o = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl(ref))}`);
    if (o.ok) {
      const j = (await o.json()) as { title?: string; thumbnail_url?: string };
      title = j.title;
      coverUrl = j.thumbnail_url;
    }
  } catch {}

  if (!creds) return title ? { title, coverUrl } : null;
  const token = await clientCredentialsToken(creds);
  if (!token) return title ? { title, coverUrl } : null;
  const res = await fetch(`https://api.spotify.com/v1/${ref.type}s/${ref.id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return title ? { title, coverUrl } : null;
  const j = (await res.json()) as {
    name: string;
    artists?: { id: string; name: string }[];
    images?: { url: string }[];
    album?: { id: string; images?: { url: string }[]; release_date?: string };
    release_date?: string;
  };
  return {
    title: j.name,
    artistName: j.artists?.map((a) => a.name).join(", "),
    artistId: j.artists?.[0]?.id,
    coverUrl: j.images?.[0]?.url ?? j.album?.images?.[0]?.url ?? coverUrl,
    albumId: ref.type === "album" ? ref.id : j.album?.id,
    releaseDate: j.release_date ?? j.album?.release_date,
  };
}
