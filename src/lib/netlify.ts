/**
 * Netlify API: add / remove a label's custom domain as a domain alias on the droplr.fm site.
 *
 * NETLIFY_API_TOKEN is a personal access token. It can act on every site the token owner can, so this module
 * only ever calls the endpoints for NETLIFY_SITE_ID and never touches droplr.fm's own domains.
 * Set the token as a secret, Functions scope, Production context only, so deploy previews (which share the
 * live database) can't change the live site's domains.
 */
const API = (process.env.NETLIFY_API_URL || "https://api.netlify.com/api/v1").replace(/\/$/, "");

const siteId = () => process.env.NETLIFY_SITE_ID || process.env.SITE_ID || "";
export const netlifyConfigured = () => !!(process.env.NETLIFY_API_TOKEN && siteId());

/** droplr's own hostnames: never attached for a label, never removed. */
export function isProtectedDomain(domain: string) {
  const d = domain.toLowerCase().replace(/\.$/, "");
  return d === "droplr.fm" || d.endsWith(".droplr.fm") || d.endsWith(".netlify.app") || d.endsWith(".netlify.live") || d === "localhost";
}

export class NetlifyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(method: "GET" | "PATCH" | "POST", path: string, body?: unknown): Promise<T> {
  if (!netlifyConfigured()) throw new NetlifyError("Netlify API isn't configured", 503);
  const res = await fetch(`${API}/sites/${encodeURIComponent(siteId())}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.NETLIFY_API_TOKEN}`, "Content-Type": "application/json", "User-Agent": "droplr.fm custom domains" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text) as { message?: string; errors?: unknown };
      msg = j.message ?? JSON.stringify(j.errors ?? j);
    } catch {}
    // Never echo headers or the token; the body is Netlify's own error text.
    throw new NetlifyError(String(msg || res.statusText).slice(0, 300), res.status);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

type Site = { custom_domain: string | null; domain_aliases: string[] | null };

async function site() {
  const s = await call<Site>("GET", "");
  return { primary: (s.custom_domain ?? "").toLowerCase(), aliases: (s.domain_aliases ?? []).map((a) => a.toLowerCase()) };
}

/** Netlify replaces the whole alias list on PATCH, so read → change → write → read back. Callers hold the domain lock. */
async function setAliases(next: string[]) {
  await call<Site>("PATCH", "", { domain_aliases: next });
  return (await site()).aliases;
}

export async function hasDomainAlias(domain: string) {
  const s = await site();
  const d = domain.toLowerCase();
  return s.primary === d || s.aliases.includes(d);
}

export async function attachDomain(domain: string) {
  const d = domain.toLowerCase();
  if (isProtectedDomain(d)) throw new NetlifyError("That domain can't be connected", 400);
  const s = await site();
  if (s.primary === d || s.aliases.includes(d)) return;
  const after = await setAliases([...s.aliases, d]);
  if (!after.includes(d)) throw new NetlifyError("Netlify didn't keep the domain alias", 502);
}

export async function detachDomain(domain: string) {
  const d = domain.toLowerCase();
  if (isProtectedDomain(d)) return;
  const s = await site();
  if (s.primary === d || !s.aliases.includes(d)) return;
  const after = await setAliases(s.aliases.filter((a) => a !== d));
  if (after.includes(d)) throw new NetlifyError("Netlify didn't remove the domain alias", 502);
}

/** Ask Netlify to (re)issue the Let's Encrypt certificate so it covers newly pointed aliases. */
export async function provisionCertificate() {
  await call("POST", "/ssl");
}

/** Turn Netlify's error into something a label can act on. */
export function friendlyNetlifyError(e: unknown) {
  if (!(e instanceof NetlifyError)) return "Couldn't reach Netlify. We'll try again shortly.";
  if (e.status === 503) return "Automatic connection isn't switched on yet. droplr.fm support will connect your domain.";
  if (e.status === 401 || e.status === 403) return "droplr.fm couldn't connect to its host. Support has been alerted; we'll retry automatically.";
  if (e.status === 422 || /already|in use|another site|taken/i.test(e.message)) {
    return "This domain is already added to another Netlify site. Remove it from that site's Domain management, then check again.";
  }
  return `Netlify said: ${e.message}`;
}
