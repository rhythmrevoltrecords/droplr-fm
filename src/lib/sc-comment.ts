import { decrypt, encrypt, randomToken, safeEqual, sha256 } from "./crypto";
import { SITE_URL } from "./env";
import { cleanScComment } from "./gate-steps";

/**
 * Binding a fan's SoundCloud comment to the fan's own browser.
 *
 * Server only (it encrypts). The gate page gets a sealed context string from here; the form,
 * the login route and the callback do the rest.
 *
 * Why this exists. The obvious design carries the comment in the OAuth state. The state is
 * encrypted, so nobody can edit it, but anyone can MAKE one: start the connect themselves with
 * their own words, copy the SoundCloud authorise link it redirects to, and post that link
 * somewhere. Every fan who approves it posts the attacker's words, because SoundCloud's consent
 * screen shows the app's name and never the comment. Found in review of the first version on
 * 27 Oct 2026.
 *
 * So the words never travel through SoundCloud at all:
 *  - The fan's own browser POSTs the comment to droplr.fm. droplr seals the words and a one-time
 *    nonce into an encrypted, HTTP-only cookie (`dfm_scc`) on droplr.fm, 15 minutes, path
 *    /api/gate/soundcloud.
 *  - The OAuth state carries only `nh`, the SHA-256 of that nonce.
 *  - The callback (also on droplr.fm) needs the cookie, for the same release, with a nonce that
 *    hashes to `nh`. A link someone else started arrives without the cookie, or with this fan's
 *    own cookie and a different nonce, and nothing is posted.
 *  - The cookie is cleared on every way out of the callback.
 *
 * The form only exists on droplr.fm's own pages, and the POST only accepts droplr.fm as its
 * Origin. Not a custom domain, even the account's own: the account holder controls what that
 * host serves (they can point its DNS at their own server), so a page there could auto-submit
 * the form with their words and the Origin would look right. Found in review, 1 Nov 2026. On a
 * custom domain or subdomain the comment step links to the same gate on droplr.fm instead.
 *
 * The page passes its visitor id and address in a sealed context, so progress lands on the
 * visitor id that page reads, and the fan comes back to it.
 */

/** One cookie per gate, so two gates open in one browser don't overwrite each other's words. */
export const SCC_COOKIE_PREFIX = "dfm_scc_";
export const sccCookieName = (releaseId: string) => `${SCC_COOKIE_PREFIX}${releaseId.replace(/[^A-Za-z0-9]/g, "")}`;
export const SCC_PATH = "/api/gate/soundcloud";
export const SCC_TTL_SECONDS = 15 * 60;
/** A gate page left open over lunch should still work; a context copied off someone else's page is bound to one release anyway. */
const CONTEXT_TTL_MS = 6 * 60 * 60_000;

const seal = (v: unknown) => Buffer.from(encrypt(JSON.stringify(v))).toString("base64url");
function unseal<T>(raw: string | null | undefined): T | null {
  if (!raw || raw.length > 4096) return null;
  try {
    return JSON.parse(decrypt(Buffer.from(raw, "base64url").toString("utf8"))) as T;
  } catch {
    return null;
  }
}

/** What the gate page tells the comment form about itself: which release, which visitor, where to come back to. */
export type GateContext = { rid: string; anon: string | null; ret: string };

export function packContext(c: GateContext, now = Date.now()): string {
  return seal({ k: "gctx", ...c, exp: now + CONTEXT_TTL_MS });
}

/** The context, only if it is ours, unexpired and for this release. */
export function unpackContext(raw: string | null | undefined, releaseId: string, now = Date.now()): GateContext | null {
  const c = unseal<GateContext & { k?: string; exp?: number }>(raw);
  if (!c || c.k !== "gctx" || typeof c.exp !== "number" || c.exp <= now) return null;
  if (c.rid !== releaseId || typeof c.ret !== "string") return null;
  return { rid: c.rid, anon: typeof c.anon === "string" && c.anon ? c.anon : null, ret: c.ret };
}

/** The cookie value and the hash that goes in the OAuth state. Null if the words aren't a usable comment. */
export function sealComment(releaseId: string, raw: unknown, now = Date.now()): { cookie: string; nh: string; words: string } | null {
  const words = cleanScComment(raw);
  if (!words) return null;
  const nonce = randomToken(24);
  return { cookie: seal({ k: "scc", rid: releaseId, n: nonce, w: words, exp: now + SCC_TTL_SECONDS * 1000 }), nh: sha256(nonce), words };
}

/** The words, only if the cookie is ours, unexpired, for this release, and its nonce hashes to the state's `nh`. */
export function openComment(cookie: string | null | undefined, releaseId: string, nh: string | null | undefined, now = Date.now()): string | null {
  if (!nh) return null;
  const c = unseal<{ k?: string; rid?: string; n?: string; w?: string; exp?: number }>(cookie);
  if (!c || c.k !== "scc" || typeof c.exp !== "number" || c.exp <= now) return null;
  if (c.rid !== releaseId || typeof c.n !== "string" || !safeEqual(sha256(c.n), nh)) return null;
  return cleanScComment(c.w);
}

/**
 * May this Origin start a comment? Only droplr.fm itself (SITE_URL). See the top of this file for
 * why not a custom domain. A missing Origin is refused: browsers send one on every form POST.
 */
export function commentOriginAllowed(origin: string | null): boolean {
  if (!origin || origin === "null") return false;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  return u.origin === new URL(SITE_URL).origin;
}

/** Is this page being served on droplr.fm itself (where the comment form may appear)? */
export const servedOnSite = (pageOrigin: string) => {
  try {
    return new URL(pageOrigin).origin === new URL(SITE_URL).origin;
  } catch {
    return false;
  }
};

export const sccCookieOptions = (secure: boolean) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure,
  path: SCC_PATH,
  maxAge: SCC_TTL_SECONDS,
});
