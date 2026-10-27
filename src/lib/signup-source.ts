/**
 * Where a new account came from: the first tagged link or outside site that brought someone to
 * droplr.fm's own pages before they signed up.
 *
 * Why it exists: without it, a sign-up from a paid ad, an outreach email, a YouTube video and a Google
 * search all look the same, so no channel can be judged. Measure before attributing.
 *
 * What it keeps, and only on droplr.fm's own marketing pages (never a label's release, bio or link
 * page, never a custom domain or label subdomain):
 *  - utm_source / utm_medium / utm_campaign from the address, cleaned to short lowercase words;
 *  - the referring site's host only ("reddit.com"), never the full address, which can carry
 *    someone's search terms or ids;
 *  - the path of the page they landed on, without its query string;
 *  - when that was.
 * Nothing about the person. It sits in one first-party, HTTP-only cookie for 30 days and is copied
 * onto the account if they sign up in that time, then the cookie is deleted.
 *
 * First touch wins: a later visit never overwrites it. A visit with no tag and no outside referrer
 * sets nothing, so "Direct or unknown" in the report means exactly that.
 *
 * The edge middleware runs this, so it imports nothing but referrer-source, which imports nothing.
 */
import { hostOf } from "./referrer-source";

export const SIGNUP_SOURCE_COOKIE = "dfm_from";
export const SIGNUP_SOURCE_DAYS = 30;

export type SignupSourceValue = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrerHost: string | null;
  landingPath: string;
  firstSeenAt: Date;
};

/**
 * droplr.fm's own public pages, where a visitor from an ad or a post lands. Label pages
 * (/<org>/<slug>, /b/<name>, /r/…) are deliberately absent: fans aren't sign-up prospects, and their
 * visits are the label's analytics, not droplr's.
 */
const MARKETING = /^\/(?:$|(?:pricing|docs|learn|legal|demo|signup|join|blog|tools|roadmap)(?:\/|$))/;
export const isMarketingPath = (pathname: string) => MARKETING.test(pathname);

/** A utm value to a short plain word: "Reddit Ads!" → "reddit_ads". Null if nothing usable is left. */
export function cleanTag(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9._-]/g, "").slice(0, 60);
  return t || null;
}

const cleanPath = (p: string) => (/^\/[A-Za-z0-9/_.~-]{0,99}$/.test(p) ? p : "/");

/** droplr.fm itself, its deploy hosts and local dev: moving between droplr's own pages isn't a source. */
function isOwnHost(host: string, selfHost: string) {
  const self = selfHost.toLowerCase().split(":")[0].replace(/^www\./, "");
  return host === self || host === "droplr.fm" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".netlify.app") || host.endsWith(".netlify.live");
}

/**
 * The cookie value to set for this visit, or null to set nothing. `url` is the page address,
 * `referer` the Referer header, `selfHost` the host the request came in on.
 */
export function captureSignupSource(opts: { url: URL; referer: string | null; selfHost: string; now?: Date }): string | null {
  if (!isMarketingPath(opts.url.pathname)) return null;
  const q = opts.url.searchParams;
  const source = cleanTag(q.get("utm_source"));
  const ref = hostOf(opts.referer);
  const referrerHost = ref && !isOwnHost(ref, opts.selfHost) ? ref : null;
  if (!source && !referrerHost) return null;
  const value = {
    v: 1,
    s: source,
    m: source ? cleanTag(q.get("utm_medium")) : null,
    c: source ? cleanTag(q.get("utm_campaign")) : null,
    r: referrerHost,
    l: cleanPath(opts.url.pathname),
    t: Math.floor((opts.now ?? new Date()).getTime() / 1000),
  };
  // Plain JSON: Next encodes a cookie value when setting it and decodes it when reading it back.
  return JSON.stringify(value);
}

/**
 * Read the cookie back at sign-up. It's whatever the browser sends, so every field is checked again
 * rather than trusted: wrong shapes, odd characters, a future time or one older than the cookie can
 * live all come back as null.
 */
export function readSignupSource(raw: string | null | undefined, now = new Date()): SignupSourceValue | null {
  if (!raw || raw.length > 1000) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  if (r.v !== 1 || typeof r.t !== "number" || !Number.isFinite(r.t)) return null;
  const at = new Date(r.t * 1000);
  if (!Number.isFinite(at.getTime())) return null;
  const age = now.getTime() - at.getTime();
  if (age < -5 * 60_000 || age > (SIGNUP_SOURCE_DAYS + 1) * 86_400_000) return null;
  const tag = (x: unknown) => (typeof x === "string" ? cleanTag(x) : null);
  // A bare host, exactly as captureSignupSource writes it: nothing with a path, port or userinfo.
  const host = typeof r.r === "string" && /^[a-z0-9.-]{1,253}$/.test(r.r) && r.r.includes(".") ? hostOf(`https://${r.r}/`) : null;
  const source = tag(r.s);
  if (!source && !host) return null;
  return {
    source,
    medium: source ? tag(r.m) : null,
    campaign: source ? tag(r.c) : null,
    referrerHost: host,
    landingPath: typeof r.l === "string" ? cleanPath(r.l) : "/",
    firstSeenAt: at,
  };
}
