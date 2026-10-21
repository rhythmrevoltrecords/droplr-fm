import { createHash, randomBytes } from "node:crypto";
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

/**
 * PKCE, which SoundCloud requires on the authorization-code flow (OAuth 2.1). The verifier is
 * 32 random bytes as base64url (43 characters, inside RFC 7636's 43–128), and the challenge is
 * its SHA-256, base64url, no padding. Without these SoundCloud refuses the authorise step, so a
 * gate looked connected in settings and failed on every fan's screen.
 */
export function codeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: codeChallenge(verifier) };
}

/** No scope parameter: SoundCloud's guide documents none for /authorize, and an unknown one is a way to be refused. */
export function soundcloudAuthorizeUrl(creds: SoundCloudCreds, redirectUri: string, state: string, challenge: string) {
  const u = new URL(`${AUTH}/authorize`);
  u.searchParams.set("client_id", creds.clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", state);
  return u.toString();
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number };

/**
 * The token exchange body. `client_id` must be in the body whatever else is sent: without it
 * SoundCloud answers 400 invalid_request before looking at anything else. That is what production
 * logged on 22 Oct 2026, and it was reproduced with a fake code: no client_id in the body gave 400,
 * and with it the request got as far as checking the client (401 for a wrong secret). The secret is
 * not in the body on the first try.
 */
export function codeExchangeBody(clientId: string, code: string, redirectUri: string, codeVerifier: string) {
  return new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, redirect_uri: redirectUri, code_verifier: codeVerifier, code });
}

/**
 * First try: the secret in a Basic header, the way SoundCloud accepted it for client credentials.
 * On 401 invalid_client, one retry with the secret in the body, the way SoundCloud's guide shows
 * it. SoundCloud checks the client before the code (a fake code with a wrong secret gives 401,
 * not invalid_grant), so a refused first try leaves the code usable. Every refusal is logged.
 */
export async function exchangeCode(creds: SoundCloudCreds, code: string, redirectUri: string, codeVerifier: string): Promise<TokenResponse> {
  const headers = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json; charset=utf-8" };
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`, "utf8").toString("base64");
  let res = await fetch(`${AUTH}/oauth/token`, {
    method: "POST",
    headers: { ...headers, Authorization: `Basic ${basic}` },
    body: codeExchangeBody(creds.clientId, code, redirectUri, codeVerifier).toString(),
  });
  if (res.status === 401) {
    console.warn(`SoundCloud code exchange: Basic refused (401 ${(await res.text()).slice(0, 120)}), retrying with the secret in the body`);
    const body = codeExchangeBody(creds.clientId, code, redirectUri, codeVerifier);
    body.set("client_secret", creds.clientSecret);
    res = await fetch(`${AUTH}/oauth/token`, { method: "POST", headers, body: body.toString() });
  }
  // SoundCloud's error bodies are short JSON like {"error":"invalid_grant"}; no token or secret.
  if (!res.ok) throw new Error(`SoundCloud token exchange failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/**
 * The client-credentials request, as SoundCloud documents it: the ID and secret in a Basic
 * Authorization header and only the grant type in the body. Sending them in the body instead is
 * refused with 401 invalid_client — measured with a real Artist Pro key on 22 Oct 2026: body
 * 401, Basic 200, same key. Pure, so the shape is testable without the network.
 */
export function clientCredentialsRequest(creds: Pick<SoundCloudCreds, "clientId" | "clientSecret">) {
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`, "utf8").toString("base64");
  return {
    url: `${AUTH}/oauth/token`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json; charset=utf-8",
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    } satisfies RequestInit,
  };
}

/** Client-credentials token, used to check a key works and to resolve public URLs to ids. */
export async function clientCredentialsToken(creds: SoundCloudCreds): Promise<string | null> {
  const { url, init } = clientCredentialsRequest(creds);
  const res = await fetch(url, init);
  if (!res.ok) {
    // Status only, never the body or the key: this is what the function log needs to tell a bad
    // key (401) from SoundCloud being down (5xx) or rate limiting (429).
    console.warn(`SoundCloud client_credentials refused: HTTP ${res.status} (${creds.source})`);
    return null;
  }
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
export async function resolveId(token: string, url: string): Promise<{ id: number; username?: string; kind?: string; sharing?: string } | null> {
  const res = await fetch(`${API}/resolve?url=${encodeURIComponent(url)}`, { headers: auth(token) });
  if (!res.ok) return null;
  const json = (await res.json()) as { id?: number; username?: string; permalink?: string; kind?: string; sharing?: string };
  return typeof json.id === "number" ? { id: json.id, username: json.username ?? json.permalink, kind: json.kind, sharing: json.sharing } : null;
}

export async function me(token: string): Promise<{ id: number; username: string } | null> {
  const res = await fetch(`${API}/me`, { headers: auth(token) });
  if (!res.ok) return null;
  const json = (await res.json()) as { id?: number; username?: string; permalink?: string };
  return typeof json.id === "number" ? { id: json.id, username: json.username ?? json.permalink ?? "" } : null;
}

/**
 * Did SoundCloud carry the action out, or was it already true?
 *
 * Pure so it can be tested without the network, because the interesting case is not 200.
 *
 * 2xx is the action happening. A follow that is already in place comes back 200 or 201, so a fan
 * who already follows passes rather than being told to unfollow and try again. The same has to
 * hold for a like and a repost, and there the documented "already in that state" answer is a
 * 409 Conflict — the fan's account already satisfies the step, which is the thing the step asks
 * about. Failing them would punish exactly the fans who were there first.
 *
 * Nothing else passes. A 401, 403, 404 or 429 leaves the step incomplete, because the whole value
 * of a performed step is that droplr never records it as done on optimism.
 */
export function isActionSuccess(status: number): boolean {
  if (status >= 200 && status < 300) return true;
  return status === 409;
}

/**
 * Carry out one gate action with the fan's own token.
 *
 * Paths and methods are SoundCloud's current public API: PUT /me/followings/{id} for a follow,
 * POST /likes/tracks/{id} and POST /reposts/tracks/{id} for the other two.
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
  const ok = isActionSuccess(res.status);
  // The status is what tells "private track" (404/403) from "already done" (409) from "rate
  // limited" (429). Without it a failed gate step is a guess.
  if (!ok) console.warn(`SoundCloud ${action} ${targetId} refused: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return ok;
}

/**
 * Always the platform host: a redirect URI has to be registered on the SoundCloud app, and a
 * label's custom domain isn't. The fan is sent back to the page they started on afterwards.
 */
export const soundcloudRedirectUri = () => `${SITE_URL}/api/gate/soundcloud/callback`;
