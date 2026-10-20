import { guessPlatformFromUrl, mailtoFor, type PlatformKey } from "./platforms";

/**
 * Reading somebody else's link-in-bio page and turning it into droplr buttons.
 *
 * The point is that an artist can leave Linktree or Hypeddit without retyping fourteen links, so
 * the bar is "good enough to edit", not "perfect". Nothing here is saved by itself: this produces
 * candidates, the artist ticks the ones they want, and the normal link editor takes it from there.
 *
 * Pure: HTML in, candidates out. No network — the fetch lives in link-import-server.ts behind the
 * same SSRF guard the artwork fetcher uses, because the URL comes from whoever is typing.
 */

export type ImportedLink = { platform: PlatformKey; url: string; title: string | null };

/** Never worth importing: the other service's own furniture, not the artist's links. */
const JUNK_PATH = /^\/(privacy|terms|tos|legal|login|log-in|signin|sign-in|signup|sign-up|register|report|abuse|help|support|about|pricing|cookies?|settings|account|discover|explore|s|share|download-the-app)(\/|$)/i;
const JUNK_HOST = /(^|\.)(linktr\.ee|linktree\.com|hypeddit\.com|beacons\.ai|beacons\.page|campsite\.bio|koji\.to|withkoji\.com|solo\.to|allmylinks\.com|bio\.link|many\.link|lnk\.bio)$/i;
const JUNK_TEXT = /^(cookie|privacy|terms|report|sign ?up|log ?in|create your own|make your own|get your own|powered by|claim your|join .* for free)/i;

const MAX_LINKS = 40;
const MAX_TITLE = 60;

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#34": '"', "#38": "&",
};

/**
 * Strip tags and collapse whitespace: anchor text arrives with icons and spans inside it.
 *
 * Entities are decoded in ONE pass, and that is the whole point rather than a style choice.
 * Decoding them one `.replace()` at a time means an earlier replacement's output is read by a
 * later one: `&amp;#39;` becomes `&#39;` and then `'`, and the same shape with `&amp;lt;` puts a
 * `<` back into a string that had its tags stripped a moment earlier. CodeQL flagged exactly that
 * (double unescaping, high) on the first version of this function.
 *
 * One pass can't do it: each match is replaced and the result is never re-scanned. Then any angle
 * bracket that decoding produced is dropped, because this is a button's title and there is no
 * reason for one to be in it.
 */
function textOf(inner: string): string {
  return inner
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
      const key = name.toLowerCase();
      if (key in ENTITIES) return ENTITIES[key];
      // A numeric entity we don't have a name for: drop it rather than decode something arbitrary.
      return key.startsWith("#") ? "" : match;
    })
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE);
}

/**
 * Same link, written two ways, is one link. Trailing slashes and tracking junk are what make a
 * fourteen-link page import as twenty-two.
 */
export function normaliseForDedupe(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$|source$)/i.test(k)) u.searchParams.delete(k);
    }
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.hostname.toLowerCase().replace(/^www\./, "")}${path}${u.search}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/**
 * Candidate buttons from a page's HTML.
 *
 * Anchors only. No script is run and no JSON blob is trusted: a page that renders its links with
 * JavaScript imports nothing, which is a worse result than guessing and a much better failure.
 */
export function extractLinks(html: string, sourceUrl: string): ImportedLink[] {
  let sourceHost = "";
  try { sourceHost = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, ""); } catch { /* keep "" */ }

  const seen = new Set<string>();
  const out: ImportedLink[] = [];

  for (const m of html.matchAll(/<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].trim();
    const title = textOf(m[2]);

    if (/^mailto:/i.test(href)) {
      const mailto = mailtoFor(href);
      if (!mailto || seen.has(mailto)) continue;
      seen.add(mailto);
      out.push({ platform: "email", url: mailto, title: title || null });
      continue;
    }

    if (!/^https?:\/\//i.test(href)) continue;
    let u: URL;
    try { u = new URL(href); } catch { continue; }

    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    // Their own site's furniture, and links back to the service being left behind.
    if (host === sourceHost || JUNK_HOST.test(host)) continue;
    if (JUNK_PATH.test(u.pathname)) continue;
    if (JUNK_TEXT.test(title)) continue;

    const key = normaliseForDedupe(u.toString());
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ platform: guessPlatformFromUrl(u.toString()), url: u.toString(), title: title || null });
    if (out.length >= MAX_LINKS) break;
  }

  return out;
}
