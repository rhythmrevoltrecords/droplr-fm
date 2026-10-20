import { publicHttpsUrl } from "./color";
import { extractLinks, type ImportedLink } from "./link-import";

/**
 * Fetch somebody's public link-in-bio page so droplr can read the links off it.
 *
 * This is the most dangerous shape of code in the app: a server fetching a URL a user typed. It
 * reuses publicHttpsUrl — the same guard the artwork fetcher uses, already audited — rather than
 * growing a second one that has to be remembered separately:
 *
 *  - https only, and no credentials in the URL;
 *  - the hostname is resolved first and refused if ANY address is private, loopback, link-local,
 *    CGNAT or otherwise not public;
 *  - redirect: "manual", because a public host can otherwise bounce the request to an internal
 *    address after the check has already passed;
 *  - a timeout and a hard byte cap, so a slow or endless response cannot hold a function open.
 *
 * It returns links and nothing else. The page's own text, headers and status never reach the
 * caller, so this cannot be used to read an internal page by proxy even if the guard were wrong.
 */

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;

export type ImportResult =
  | { ok: true; links: ImportedLink[] }
  | { ok: false; error: string };

export const IMPORT_UNREACHABLE = "Couldn't open that page. Check the address opens in a browser, and that it's a public page.";
export const IMPORT_NOT_A_PAGE = "That address didn't give back a web page.";
export const IMPORT_EMPTY = "No links found on that page. Some builders only draw their links once the page is open in a browser, and droplr can't see those.";

export async function importLinksFrom(raw: string): Promise<ImportResult> {
  const url = await publicHttpsUrl(raw.trim());
  if (!url) return { ok: false, error: IMPORT_UNREACHABLE };

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "text/html,application/xhtml+xml" },
    });
  } catch {
    return { ok: false, error: IMPORT_UNREACHABLE };
  }
  if (!res.ok || !res.body) return { ok: false, error: IMPORT_UNREACHABLE };
  if (!(res.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) {
    return { ok: false, error: IMPORT_NOT_A_PAGE };
  }

  // Read with a hard cap rather than res.text(): an endless body would otherwise be read forever.
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > MAX_BYTES) break;
      chunks.push(value);
    }
  } catch {
    return { ok: false, error: IMPORT_UNREACHABLE };
  } finally {
    await reader.cancel().catch(() => {});
  }

  const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
  const links = extractLinks(html, url.toString());
  if (links.length === 0) return { ok: false, error: IMPORT_EMPTY };
  return { ok: true, links };
}
