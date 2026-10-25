/**
 * Importing somebody else's link-in-bio page. Pure: no network.
 *
 * Two jobs, and the second one is the serious one.
 *
 * READING A PAGE well enough that an artist can leave Linktree or Hypeddit without retyping
 * fourteen links. "Good enough to edit" is the bar — they tick what they want and the normal
 * editor takes over.
 *
 * AND NOT BECOMING A PROXY. This is the most dangerous shape of code in droplr: a server fetching
 * a URL a person typed. The guard is the one the artwork fetcher already uses, and these checks
 * exist so it cannot be quietly replaced by a weaker one that looks similar.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractLinks, normaliseForDedupe } from "../src/lib/link-import";
import { isPrivateIp } from "../src/lib/color";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SRC = "https://linktr.ee/ototo";
const page = `
  <html><body>
    <a href="https://open.spotify.com/artist/abc"><span>Listen</span> on Spotify</a>
    <a href="https://www.instagram.com/ototo/">Instagram</a>
    <a href="https://soundcloud.com/ototo?utm_source=linktree">SoundCloud</a>
    <a href="https://soundcloud.com/ototo/">SoundCloud again</a>
    <a href="mailto:bookings@ototo.au">Bookings</a>
    <a href="https://linktr.ee/s/about/cookie-notice">Cookie notice</a>
    <a href="https://linktr.ee/ototo/privacy">Privacy</a>
    <a href="/terms">Terms</a>
    <a href="https://linktr.ee/register">Create your own Linktree</a>
    <a href="https://linktr.ee/someoneelse">Another creator</a>
    <a href="https://beacons.ai/someoneelse">Beacons creator</a>
    <a href="https://www.linktr.ee/ototo">Their own page again</a>
    <a href="javascript:alert(1)">Nope</a>
    <a href="tel:+61400000000">Call</a>
  </body></html>`;

const got = extractLinks(page, SRC);
const urls = got.map((l) => l.url);

// ---- reading the page ----------------------------------------------------

check("the artist's real links come through", urls.some((u) => u.includes("open.spotify.com")) && urls.some((u) => u.includes("instagram.com")));
check("platforms are recognised, not left as generic links",
  got.find((l) => l.url.includes("spotify"))?.platform === "spotify" && got.find((l) => l.url.includes("instagram"))?.platform === "instagram");
check("the anchor's words become the button title",
  got.find((l) => l.url.includes("spotify"))?.title === "Listen on Spotify",
  got.find((l) => l.url.includes("spotify"))?.title ?? "");
check("an email address comes across as an email button",
  got.some((l) => l.platform === "email" && l.url === "mailto:bookings@ototo.au"));

// Same link written two ways is one link — this is what makes fourteen links import as twenty-two.
check("the same link twice is imported once", urls.filter((u) => u.includes("soundcloud.com")).length === 1,
  urls.filter((u) => u.includes("soundcloud.com")).join(" | "));
check("tracking junk does not make a link look different",
  normaliseForDedupe("https://x.com/a?utm_source=linktree") === normaliseForDedupe("https://www.x.com/a/"));

// ---- entities are decoded once, never twice ------------------------------
//
// CodeQL caught this as a high: the first version decoded "&amp;" and then "&#39;" in separate
// passes, so "&amp;#39;" became "&#39;" and then "'". The same shape with "&amp;lt;" puts a "<"
// back into a string whose tags were stripped a moment earlier. One pass fixes it, because a
// replacement's output is never re-scanned.
{
  const titleOf = (text: string) =>
    extractLinks(`<a href="https://example.com/x">${text}</a>`, SRC)[0]?.title ?? "";

  check("a double-escaped entity is not decoded twice", titleOf("&amp;#39;") === "&#39;",
    titleOf("&amp;#39;"));
  check("a double-escaped tag cannot be rebuilt", !titleOf("&amp;lt;script&amp;gt;").includes("<"),
    titleOf("&amp;lt;script&amp;gt;"));
  check("a real ampersand still reads properly", titleOf("Tom &amp; Jerry") === "Tom & Jerry", titleOf("Tom &amp; Jerry"));
  check("named entities decode", titleOf("&quot;Quoted&quot;") === '"Quoted"', titleOf("&quot;Quoted&quot;"));
  check("numeric entities decode", titleOf("&#39;Hi&#39;") === "'Hi'", titleOf("&#39;Hi&#39;"));
  check("tags are stripped", titleOf("<b>Bold</b> text") === "Bold text", titleOf("<b>Bold</b> text"));
  check("no angle bracket survives in a button title", !titleOf("a &lt;b&gt; c").includes("<") && !titleOf("a &lt;b&gt; c").includes(">"),
    titleOf("a &lt;b&gt; c"));
}

// ---- what must NOT come through -----------------------------------------

check("the service's own furniture is left behind", !urls.some((u) => /cookie|privacy|terms|register/i.test(u)),
  urls.filter((u) => /cookie|privacy|terms|register/i.test(u)).join(" | "));
// These three are caught by the HOST rule alone: ordinary paths, ordinary link text. Without a
// case like them the host rule was untested — the junk-path and junk-text rules were quietly
// covering for it, which a negative control is the only way to notice.
check("links back to the page being left are dropped", !urls.some((u) => u.includes("linktr.ee")),
  urls.filter((u) => u.includes("linktr.ee")).join(" | "));
check("other people's pages on the same builder are dropped", !urls.some((u) => u.includes("beacons.ai")),
  "importing a page should not import whoever it links to on the same service");
check("javascript: is not a link", !urls.some((u) => u.startsWith("javascript:")));
check("tel: is not imported", !urls.some((u) => u.startsWith("tel:")));
check("relative links are ignored rather than guessed at", !urls.some((u) => u === "/terms"));
check("every imported URL is http(s) or a mailto",
  got.every((l) => /^https?:\/\//i.test(l.url) || /^mailto:/i.test(l.url)));
check("a page with nothing on it imports nothing", extractLinks("<html><body><p>hi</p></body></html>", SRC).length === 0);
check("the import is capped", extractLinks(
  Array.from({ length: 80 }, (_, i) => `<a href="https://example.com/${i}">L${i}</a>`).join(""), SRC).length <= 40);

// ---- the fetch guard -----------------------------------------------------

const server = code(read("src/lib/link-import-server.ts"));
check("it reuses the audited guard instead of its own", server.includes("publicHttpsUrl"),
  "a second guard is one that has to be remembered separately");
// The request goes through lib/untrusted-get: node:https, which never follows a redirect and never
// decompresses (fetch() did both risks: redirects needed "manual", and Brotli was CVE-2026-111497).
const ug = code(read("src/lib/untrusted-get.ts"));
check("redirects are not followed", server.includes("untrustedGet(") && /from "node:https"/.test(ug) && !/\bfetch\(/.test(ug) && !/follow/i.test(ug),
  "a public host can otherwise bounce the request to an internal address after the check passed");
check("there is a timeout", /timeoutMs: TIMEOUT_MS/.test(server) && /setTimeout\(/.test(ug));
check("there is a byte cap", /maxBytes: MAX_BYTES/.test(server) && /size > o\.maxBytes/.test(ug));
check("only html is read", /text\/html/.test(server));
check("the page's own text never reaches the caller",
  !/return \{ ok: true, (html|body|text)/.test(server) && server.includes("links"),
  "returning the body would make this a proxy for reading internal pages");

// The guard itself, still doing its job — these are the addresses an attacker reaches for.
for (const ip of ["127.0.0.1", "10.0.0.1", "192.168.1.1", "169.254.169.254", "172.16.0.1", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
  check(`${ip} is refused as private`, isPrivateIp(ip));
}
check("a real public address is allowed", !isPrivateIp("1.1.1.1") && !isPrivateIp("2606:4700::1111"));

// ---- the route writes nothing -------------------------------------------

const route = code(read("src/app/api/admin/links/import/route.ts"));
check("the import route is signed in only", /apiUser\("label"\)/.test(route));
check("it is throttled", /allow\(`link-import:/.test(route),
  "an endpoint that makes the server fetch a typed URL needs a budget");
check("the throttle is per account, not per URL", /link-import:\$\{user\.organizationId\}/.test(route),
  "a per-URL budget resets whenever the caller changes the address, which makes it not a budget");
check("it writes nothing", !/prisma\./.test(route),
  "candidates only — the artist ticks what they want and saves through the normal route");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
