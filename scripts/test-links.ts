/**
 * Social and contact buttons. Pure: no database, no server, no network.
 *
 * Two things this guards, and both are about a button telling the truth.
 *
 * An EMAIL button carries a mailto:. `mailto:?bcc=…` is a way to make a button do something other
 * than what it says, so a stored address is a plain address and nothing else — no query string, no
 * second recipient, no header a fan never sees. It is also the one link type that does not go
 * through the click-counting redirect, which refuses non-http on purpose; a 302 to mailto: is a
 * coin flip inside the in-app browsers these pages are mostly opened from.
 *
 * And the marks: three social logos are pure black in their brand books, which is invisible on a
 * dark page. They reuse the data-mono path the near-white marks already take.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { linksPayloadSchema } from "../src/lib/link-input";
import { PLATFORMS, PLATFORM_GROUPS, PLATFORM_KEYS, SOCIAL_PLATFORMS, emailAddressOf, isMailto, mailtoFor, platformMeta } from "../src/lib/platforms";
import { PLATFORM_LOGOS } from "../src/lib/platform-logos";

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

// ---- the catalogue -------------------------------------------------------

check("the socials an artist actually uses are all there",
  ["instagram", "tiktok", "x", "facebook", "threads", "twitch", "discord", "website", "email"].every((k) => SOCIAL_PLATFORMS.includes(k as never)));
check("every social key is a real platform", SOCIAL_PLATFORMS.every((k) => !!PLATFORMS[k]));
check("every social has a name, an action and a monogram",
  SOCIAL_PLATFORMS.every((k) => platformMeta(k).name && platformMeta(k).action && platformMeta(k).monogram));
check("none of them is still the generic Link button",
  SOCIAL_PLATFORMS.every((k) => platformMeta(k).name !== "Link"));

// ---- how the picker is grouped -------------------------------------------
//
// By what a platform IS, not by how droplr finds it. The old grouping filed Spotify, Apple Music,
// Deezer and Tidal under "Other", because "Other" quietly meant "resolved from a UPC lookup" — a
// fact about the resolver that nobody choosing from a dropdown can see.
{
  const listed = PLATFORM_GROUPS.flatMap((g) => g.keys);
  check("every platform appears in the picker", PLATFORM_KEYS.every((k) => listed.includes(k)),
    PLATFORM_KEYS.filter((k) => !listed.includes(k)).join(", "));
  check("none appears twice", new Set(listed).size === listed.length,
    listed.filter((k, i, a) => a.indexOf(k) !== i).join(", "));
  check("no group is empty", PLATFORM_GROUPS.every((g) => g.keys.length > 0));

  const groupOf = (k: string) => PLATFORM_GROUPS.find((g) => g.keys.includes(k as never))?.label;
  for (const k of ["spotify", "appleMusic", "deezer", "tidal"]) {
    check(`${k} is under Streaming, not Other`, groupOf(k) === "Streaming", String(groupOf(k)));
  }
  for (const k of ["beatport", "traxsource", "bandcamp"]) {
    check(`${k} is under Stores & DJ`, groupOf(k) === "Stores & DJ", String(groupOf(k)));
  }
  check("email and the socials are in their own group",
    SOCIAL_PLATFORMS.every((k) => groupOf(k) === "Social & contact"));
  check("the custom button is not mixed in with real platforms", groupOf("custom") === "Other");
  check("Streaming is ordered by the platform weights",
    PLATFORM_GROUPS[0].keys.every((k, i, a) => i === 0 || PLATFORMS[a[i - 1]].weight <= PLATFORMS[k].weight));
}
const editorSrc = read("src/components/admin/link-editor.tsx");
check("the editor renders the groups rather than its own list", editorSrc.includes("PLATFORM_GROUPS.map"));
check("Detect from URL is still offered", editorSrc.includes('value="auto"'));

// ---- the marks -----------------------------------------------------------

for (const k of ["instagram", "tiktok", "x", "facebook", "threads", "twitch", "discord"] as const) {
  const logo = PLATFORM_LOGOS[k];
  check(`${k} has a real logo path`, !!logo && logo.path.length > 100, logo ? `len=${logo.path.length}` : "missing");
  check(`${k}'s path is SVG path data`, !!logo && /^[Mm][\d.\s-]/.test(logo.path));
}
// Pure black would be invisible on a dark page; white takes the existing data-mono flip instead.
for (const k of ["x", "threads"] as const) {
  check(`${k} is not left pure black`, platformMeta(k).color.toLowerCase() !== "#000000", platformMeta(k).color);
  check(`${k} takes the data-mono path so light themes flip it`, /^#f{3}(f{3})?$/i.test(platformMeta(k).color));
}
check("TikTok matches the colour TikTok Sound already uses",
  platformMeta("tiktok").color === platformMeta("tiktokSound").color);

// ---- email addresses -----------------------------------------------------

check("a plain address becomes a mailto", mailtoFor("bookings@ototo.au") === "mailto:bookings@ototo.au");
check("an address that is already a mailto is not doubled", mailtoFor("mailto:a@b.co") === "mailto:a@b.co");
check("surrounding spaces are trimmed", mailtoFor("  a@b.co  ") === "mailto:a@b.co");

// The ones that would make a button do something other than what it says.
for (const bad of ["a@b.co?bcc=someone@else.com", "a@b.co&cc=x@y.z", "a@b.co,c@d.co", "a@b.co;c@d.co", "a@b.co<script>", "a b@c.co"]) {
  check(`${JSON.stringify(bad)} is refused`, mailtoFor(bad) === null);
}
for (const bad of ["", "   ", "notanemail", "@b.co", "a@", "a@b", "https://example.com"]) {
  check(`${JSON.stringify(bad)} is not an address`, mailtoFor(bad) === null);
}
check("the address reads back for the admin", emailAddressOf("mailto:a@b.co") === "a@b.co");
check("isMailto spots one", isMailto("mailto:a@b.co") && !isMailto("https://example.com"));

// ---- the schema: the platform decides which kind of URL is allowed -------

const rows = (platform: string, url: string) => linksPayloadSchema.safeParse({ links: [{ platform, url, visible: true }] });
check("an email button accepts an address", rows("email", "mailto:a@b.co").success);
check("an email button REFUSES an http link", !rows("email", "https://example.com").success,
  "a button that says Email and opens a website is a button that lies");
check("an email button refuses a bcc smuggled into the address", !rows("email", "mailto:a@b.co?bcc=x@y.z").success);
check("a normal button accepts https", rows("instagram", "https://instagram.com/ototo").success);
check("a normal button REFUSES a mailto", !rows("instagram", "mailto:a@b.co").success);
check("a normal button still refuses javascript:", !rows("custom", "javascript:alert(1)").success);
check("a normal button still refuses a bare domain", !rows("custom", "example.com").success);

// ---- the click route, and why email goes around it -----------------------

const route = code(read("src/app/api/b/[linkId]/route.ts"));
check("the click-counting redirect still refuses anything that is not http(s)", /\^\\\\?https\?/.test(route) || route.includes("^https?:"),
  "it is an open-redirect guard and email must not be the reason it is loosened");
const view = code(read("src/components/public/bio-view.tsx"));
check("the page renders a mailto itself instead of redirecting to it", /isMailto\(l\.url\) \? l\.url :/.test(view));

// ---- the admin says what it cannot count ---------------------------------

const editor = read("src/components/admin/link-editor.tsx");
check("the editor offers the socials", editor.includes("PLATFORM_GROUPS.map"));
check("the editor takes a plain address for an email button", editor.includes('mailtoFor(e.target.value)'));
check("the editor admits email taps are not counted", /aren&apos;t counted|aren't counted/.test(editor),
  "\"I can't tell\" is a real answer and belongs in the UI");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
