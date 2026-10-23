/**
 * IndexNow: telling Bing (and Yandex, Seznam, Naver) the moment a public page changes, instead of
 * waiting for them to come back and notice. Bing's index also feeds DuckDuckGo and Copilot, so for
 * an artist this is "the page is findable today, not in a fortnight", and nobody has to open a
 * webmaster console. Google does not take part; it reads sitemaps.
 *
 * How it proves droplr is allowed to speak for a host: a key, served as a text file on that host
 * (/indexnow-key.txt). The same app answers on droplr.fm and on every label's custom domain, so one
 * key covers all of them, and each request names its own host's copy.
 *
 * The key is not a secret in the usual sense: it is published by design. It lives in an env var
 * (INDEXNOW_KEY) only so it is set once in Netlify and never in this public repo's history. Unset,
 * the whole feature is off.
 *
 * Pure: no prisma, no fetch. The sending lives in indexnow-server.
 */

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_KEY_PATH = "/indexnow-key.txt";

/** The protocol's own rule: 8 to 128 letters, digits or dashes. Anything else is treated as unset. */
export function validIndexNowKey(raw: string | null | undefined): string | null {
  const k = (raw ?? "").trim();
  return /^[A-Za-z0-9-]{8,128}$/.test(k) ? k : null;
}

export type IndexNowBatch = { host: string; key: string; keyLocation: string; urlList: string[] };

/**
 * One request per host, because a request may only list URLs on the host whose key file it names.
 * https only, deduplicated, and capped at the protocol's 10,000 per request.
 */
export function indexNowBatches(urls: (string | null | undefined)[], key: string): IndexNowBatch[] {
  const byHost = new Map<string, Set<string>>();
  for (const u of urls) {
    if (!u) continue;
    let parsed: URL;
    try { parsed = new URL(u); } catch { continue; }
    if (parsed.protocol !== "https:") continue;
    const host = parsed.hostname.toLowerCase();
    if (!byHost.has(host)) byHost.set(host, new Set());
    byHost.get(host)!.add(parsed.toString());
  }
  return [...byHost].map(([host, set]) => ({
    host,
    key,
    keyLocation: `https://${host}${INDEXNOW_KEY_PATH}`,
    urlList: [...set].slice(0, 10_000),
  }));
}
