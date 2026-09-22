import { prisma } from "./db";
import { SITE_URL } from "./env";
import { decrypt } from "./crypto";

/**
 * SoundCloud, for gate steps that actually happen.
 *
 * The important thing about SoundCloud's API is what it does NOT offer: there is no endpoint to
 * ask whether a given user follows a given account. So a gate can't *check* a follow. What it
 * can do is *perform* one — the fan authorises droplr once, droplr calls PUT /me/followings/{id}
 * with their own token, and the response says whether it happened.
 *
 * That's a stronger claim than checking, not a weaker one: droplr did the thing, so it is
 * certain the thing was done. It's also a better flow for the fan — one button, no leaving the
 * page to go and click follow and then coming back.
 *
 * Credentials: self-serve API keys returned in May 2026 but require an Artist Pro subscription
 * on the artist's own SoundCloud account; without one, registration is a form with a manual
 * review measured in weeks. So BYO first, platform app as a fallback — with the caveat that the
 * platform key carries every account's traffic under one rate limit, which is exactly how
 * droplr lost the ability to be the central Spotify pre-save provider.
 */

const API = "https://api.soundcloud.com";
const AUTH = "https://secure.soundcloud.com";

/** Perform actions on the fan's behalf, and read their profile to record who unlocked. */
export const SOUNDCLOUD_SCOPES = ["non-expiring"];

export type SoundCloudCreds = { clientId: string; clientSecret: string; source: "byo" | "platform" };

export async function getSoundCloudCreds(organizationId: string): Promise<SoundCloudCreds | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { soundcloudClientIdEncrypted: true, soundcloudClientSecretEncrypted: true, soundcloudAppStatus: true },
  });
  if (org?.soundcloudClientIdEncrypted && org.soundcloudClientSecretEncrypted && org.soundcloudAppStatus !== "none") {
    return {
      clientId: decrypt(org.soundcloudClientIdEncrypted),
      clientSecret: decrypt(org.soundcloudClientSecretEncrypted),
      source: "byo",
    };
  }
  if (process.env.SOUNDCLOUD_PLATFORM_FALLBACK === "true" && process.env.SOUNDCLOUD_CLIENT_ID && process.env.SOUNDCLOUD_CLIENT_SECRET) {
    return { clientId: process.env.SOUNDCLOUD_CLIENT_ID, clientSecret: process.env.SOUNDCLOUD_CLIENT_SECRET, source: "platform" };
  }
  return null;
}

/** https://soundcloud.com/ototo or .../ototo/track-name → the path, which is what resolve() needs. */
export function parseSoundCloudUrl(input: string): { url: string; isTrack: boolean } | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)soundcloud\.com$/i.test(u.hostname)) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  // /user → profile. /user/track → a track. /user/sets/name → a playlist, which we treat as a track-ish resource.
  return { url: `https://soundcloud.com/${parts.join("/")}`, isTrack: parts.length > 1 };
}

export function soundcloudAuthorizeUrl(creds: SoundCloudCreds, redirectUri: string, state: string) {
  const u = new URL(`${AUTH}/authorize`);
  u.searchParams.set("client_id", creds.clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SOUNDCLOUD_SCOPES.join(" "));
  u.searchParams.set("state", state);
  return u.toString();
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number };

export async function exchangeCode(creds: SoundCloudCreds, code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch(`${AUTH}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json; charset=utf-8" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });
  if (!res.ok) throw new Error(`SoundCloud token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Client-credentials token, used to check a key works and to resolve public URLs to ids. */
export async function clientCredentialsToken(creds: SoundCloudCreds): Promise<string | null> {
  const res = await fetch(`${AUTH}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json; charset=utf-8" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: creds.clientId, client_secret: creds.clientSecret }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as TokenResponse;
  return json.access_token ?? null;
}

const auth = (token: string) => ({ Authorization: `OAuth ${token}`, Accept: "application/json; charset=utf-8" });

/**
 * A soundcloud.com URL → the numeric id behind it.
 *
 * Stored at save time so a later username change can't silently break every gate pointing at
 * that account — SoundCloud URLs are mutable, ids are not.
 */
export async function resolveId(token: string, url: string): Promise<{ id: number; username?: string; kind?: string } | null> {
  const res = await fetch(`${API}/resolve?url=${encodeURIComponent(url)}`, { headers: auth(token) });
  if (!res.ok) return null;
  const json = (await res.json()) as { id?: number; username?: string; permalink?: string; kind?: string };
  return typeof json.id === "number" ? { id: json.id, username: json.username ?? json.permalink, kind: json.kind } : null;
}

export async function me(token: string): Promise<{ id: number; username: string } | null> {
  const res = await fetch(`${API}/me`, { headers: auth(token) });
  if (!res.ok) return null;
  const json = (await res.json()) as { id?: number; username?: string; permalink?: string };
  return typeof json.id === "number" ? { id: json.id, username: json.username ?? json.permalink ?? "" } : null;
}

/**
 * Carry out one gate action with the fan's own token.
 *
 * Returns true only on a response SoundCloud treats as success. A 4xx is a genuine failure and
 * the step stays incomplete — the whole value of a performed step is that droplr never records
 * it as done on optimism.
 *
 * Already-following returns 200 or 201 rather than an error, so a fan who already follows
 * passes the step instead of being told to unfollow and try again.
 */
export async function performAction(
  token: string,
  action: "follow" | "like" | "repost",
  targetId: number,
): Promise<boolean> {
  const path =
    action === "follow" ? `/me/followings/${targetId}`
    : action === "like" ? `/likes/tracks/${targetId}`
    : `/reposts/tracks/${targetId}`;
  const method = action === "follow" ? "PUT" : "POST";
  const res = await fetch(`${API}${path}`, { method, headers: auth(token) });
  return res.status >= 200 && res.status < 300;
}

/**
 * Always the platform host: a redirect URI has to be registered on the SoundCloud app, and a
 * label's custom domain isn't. The fan is sent back to the page they started on afterwards.
 */
export const soundcloudRedirectUri = () => `${SITE_URL}/api/gate/soundcloud/callback`;
