import { encrypt, decrypt } from "./crypto";
import { prisma } from "./db";
import { isPlatformHost, platformSubdomain, SITE_HOST, SITE_URL } from "./env";

export type OAuthState = {
  rid: string; // releaseId
  org: string; // organizationId
  vid?: string | null; // variantId
  anon?: string | null;
  em?: string | null; // email (only if consented)
  src?: string | null;
  ret: string; // absolute return URL (release page)
  ru: string; // redirect_uri used for the authorize call
  exp: number;
};

export function packState(s: Omit<OAuthState, "exp">) {
  return Buffer.from(encrypt(JSON.stringify({ ...s, exp: Date.now() + 15 * 60_000 }))).toString("base64url");
}

export function unpackState(raw: string | null): OAuthState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(decrypt(Buffer.from(raw, "base64url").toString("utf8"))) as OAuthState;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export function requestOrigin(req: Request) {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(SITE_URL).host;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return { host, origin: `${proto}://${host}`, tenant: !isPlatformHost(host) || !!platformSubdomain(host) };
}

/**
 * Redirect targets built from the Host / X-Forwarded-Host header (or carried in OAuth state) must point at
 * us: SITE_URL's host, droplr.fm, a label subdomain, or a label's connected custom domain.
 * Deliberately NOT *.netlify.app: anyone can deploy there, which would make this an open redirect.
 */
export async function isAllowedReturnUrl(raw: string | null | undefined) {
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.origin === new URL(SITE_URL).origin) return true;
  const host = url.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1";
  if (local) return process.env.NODE_ENV !== "production"; // dev servers on other ports
  if (url.protocol !== "https:") return false;
  if (host === SITE_HOST.split(":")[0] || host === "droplr.fm" || host === "www.droplr.fm" || platformSubdomain(host)) return true;
  return !!(await prisma.organization.findUnique({ where: { customDomain: host }, select: { id: true } }));
}

/** raw if it's one of our hosts, otherwise the fallback (SITE_URL by default). */
export async function safeReturnUrl(raw: string | null | undefined, fallback = SITE_URL) {
  return raw && (await isAllowedReturnUrl(raw)) ? raw : fallback;
}

/** Where the fan came from: tenant hosts use /slug, platform uses /org/slug */
export function releasePageUrl(req: Request, org: { slug: string }, releaseSlug: string, variantSlug?: string | null) {
  const { origin, tenant } = requestOrigin(req);
  const path = tenant ? `/${releaseSlug}` : `/${org.slug}/${releaseSlug}`;
  return `${origin}${path}${variantSlug ? `/${variantSlug}` : ""}`;
}

/** Custom domains get their own callback (white-label); platform uses SPOTIFY_REDIRECT_URI. */
export function spotifyRedirectUri(req: Request) {
  const { origin, tenant, host } = requestOrigin(req);
  if (tenant && !platformSubdomain(host)) return `${origin}/api/spotify/callback`;
  return process.env.SPOTIFY_REDIRECT_URI || `${origin}/api/spotify/callback`;
}

export function withParam(url: string, key: string, value: string) {
  const u = new URL(url);
  u.searchParams.set(key, value);
  return u.toString();
}
