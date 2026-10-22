/**
 * The social icon row on a bio page and on a release page (pre-save and smart link).
 *
 * Pure functions plus source assertions. No database, no server. The redirect's behaviour against a
 * real server -- counted, never open, scoped to the page's own organisation -- is section 100 of
 * test-security.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SOCIAL_KEYS } from "../src/lib/artist-fields";
import { ICON_PLATFORM_PREFIX, bioSocials, iconPlatform, releaseSocialHref, showSocials, socialHref, socialTarget, socialsFor } from "../src/lib/bio-socials";

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

const profile = {
  tiktok: "https://tiktok.com/@nh",
  instagram: "https://instagram.com/nh",
  spotify: "https://open.spotify.com/artist/x",
  facebook: "http://facebook.com/insecure",
  youtube: "javascript:alert(1)",
  x: "not a url",
  bogus: "https://evil.example",
};
const icons = bioSocials(profile);
check("icons come out in one fixed order, not the profile's", icons.map((i) => i.key).join() === "instagram,tiktok,spotify", icons.map((i) => i.key).join());
check("only https addresses become icons", !icons.some((i) => i.key === "facebook" || i.key === "youtube" || i.key === "x"));
check("keys the profile form doesn't know are ignored", !icons.some((i) => (i.key as string) === "bogus"));
check("every icon has a readable label", icons.every((i) => i.label.length > 1));
for (const junk of [null, undefined, "str", 42, [], [["instagram", "https://x"]]]) {
  check(`nothing from ${JSON.stringify(junk)}`, bioSocials(junk).length === 0);
}
check("silent when the profile has no socials", bioSocials({}).length === 0);

check("a tap's target is the profile's own address", socialTarget(profile, "instagram") === "https://instagram.com/nh");
for (const k of ["facebook", "youtube", "bogus", "__proto__", "constructor", "toString", "", "INSTAGRAM", "instagram/../x"]) {
  check(`no target for "${k}"`, socialTarget(profile, k) === null);
}
check("only \"on\" shows the row", showSocials({ socialIcons: "on" }) && !showSocials({ socialIcons: null }) && !showSocials({ socialIcons: "yes" }) && !showSocials({ socialIcons: "" }));
check("the counted address is droplr's own", socialHref("p1", "instagram") === "/api/b/social/p1/instagram");
check("an icon tap is stored with a prefix", iconPlatform("instagram") === "icon:instagram" && ICON_PLATFORM_PREFIX === "icon:");
check("every profile social has a mark to draw", (() => { const logos = read("src/lib/platform-logos.ts"); return SOCIAL_KEYS.every((k) => new RegExp(`\\n\\s*${k}: \\{ title:`).test(logos)); })());

const a1 = { id: "a1", socialLinks: { instagram: "https://instagram.com/a1" } };
const a2 = { id: "a2", socialLinks: { tiktok: "https://tiktok.com/@a2" } };
const artistMap = socialsFor([a1, a2], "artist");
check("an artist account's page defaults to its profile", artistMap[""].map((i) => i.key).join() === "instagram");
check("a label's own page has no icons until an artist is picked", socialsFor([a1, a2], "label")[""].length === 0);
check("picking an artist previews that artist's icons", socialsFor([a1, a2], "label")["a2"].map((i) => i.key).join() === "tiktok");

const route = code(read("src/app/api/b/social/[pageId]/[key]/route.ts"));
check("the redirect never reads a destination from the request", !/searchParams\.get\("(url|to|next|redirect)"\)/.test(route) && /NextResponse\.redirect\(target, 302\)/.test(route));
check("the redirect 404s unless the page is public and the row is on", /!page \|\| !page\.isPublic \|\| !showSocials\(page\)/.test(route));
check("the redirect looks the address up on the page's own profile", /socialTarget\(await socialSource\(page, page\.organization\.kind\), key\)/.test(route));
check("the redirect stores the prefixed platform and no link id", /platform: iconPlatform\(/.test(route) && !/bioLinkId:/.test(route));
const server = code(read("src/lib/bio-socials-server.ts"));
check("the profile is always looked up inside the page's organisation", (server.match(/organizationId: page\.organizationId/g) ?? []).length === 2);
check("preview and page pick the same default profile", /orderBy: \{ name: "asc" \}/.test(server) && /orderBy: \{ name: "asc" \}/.test(read("src/app/admin/bio/new/page.tsx")) && /orderBy: \{ name: "asc" \}/.test(read("src/app/admin/bio/[id]/page.tsx")));
const stats = code(read("src/lib/bio-stats.ts"));
check("the stats count icon taps by their prefix only", /bioLinkId: null, platform: \{ startsWith: ICON_PLATFORM_PREFIX \}/.test(stats));
const view = read("src/components/public/bio-view.tsx");
check("socials are required on BioViewData", /\n\s*socials: SocialIcon\[\];/.test(view));
check("the row only renders when there is something in it", /if \(icons\.length === 0\) return null;/.test(read("src/components/public/social-icons.tsx")));
check("icons draw with the page's text colour, not brand colours", /fill="currentColor"/.test(read("src/components/public/social-icons.tsx")) && /text-white\/85/.test(read("src/components/public/social-icons.tsx")));
const bioRoute = code(read("src/components/public/bio-route.tsx"));
check("the public page only looks the profile up when the row is on", /showSocials\(page\) \? socialSource\(/.test(bioRoute));
check("every icon on the public page goes through the counted redirect", /href: socialHref\(page\.id, s\.key\)/.test(bioRoute));
check("a new page starts with icons on", /socialIcons: "on"/.test(read("src/app/admin/bio/new/page.tsx")));
check("an existing page keeps what it had", /socialIcons: page\.socialIcons \?\? ""/.test(read("src/app/admin/bio/[id]/page.tsx")));

// ---- release pages (pre-save and smart link) -------------------------------------------------

check("a release icon goes through the release's own counted route", releaseSocialHref("r1", "tiktok") === "/api/r/social/r1/tiktok");
const rroute = code(read("src/app/api/r/social/[releaseId]/[key]/route.ts"));
check("the release redirect never reads a destination from the request", !/searchParams\.get\("(url|to|next|redirect)"\)/.test(rroute) && /NextResponse\.redirect\(target, 302\)/.test(rroute));
check("…404s unless public, a release or download page, and switched on", /!release \|\| !release\.isPublic \|\| \(release\.kind !== "release" && release\.kind !== "download"\) \|\| !showSocials\(release\)/.test(rroute));
check("…looks the address up on the release's own profile", /socialTarget\(await socialSource\(release, release\.organization\.kind\), key\)/.test(rroute));
check("…and stores the prefixed platform with the release, no link id", /releaseId: release\.id/.test(rroute) && /platform: iconPlatform\(/.test(rroute) && !/linkId:/.test(rroute));
const rview = read("src/components/public/release-view.tsx");
check("socials are required on ReleaseViewData", /\n\s*socials: SocialIcon\[\];/.test(rview));
check("the release page renders the shared row under the artist", /<SocialIcons icons=\{release\.socials\}/.test(rview));
check("bio and release pages share one icon component", /<SocialIcons icons=\{page\.socials\}/.test(read("src/components/public/bio-view.tsx")));
const pr = code(read("src/components/public/public-route.tsx"));
check("the release page only looks the profile up when the box is ticked", /showSocials\(release\)\s*\?\s*bioSocials\(await socialSource\(release, org\.kind\)\)/.test(pr));
check("every release icon goes through the counted route", /href: releaseSocialHref\(release\.id, s\.key\)/.test(pr));
check("the demo shows no icons, so an example can't read as a real profile", /socials: \[\]/.test(read("src/app/demo/demo-track/demo-view.tsx")));
check("a new release starts with icons on", /socialIcons: "on"/.test(code(read("src/app/api/admin/releases/route.ts"))));
check("an existing release keeps what it had (the switch now lives on the Look tab)", /initialSocialsOn=\{release\.socialIcons === "on"\}/.test(read("src/app/admin/releases/[id]/page.tsx")));
const an = code(read("src/lib/analytics.ts"));
check("icon taps stay out of the per-store breakdown", /!r\.platform\.startsWith\(ICON_PLATFORM_PREFIX\) && platformMap\.set/.test(an));
check("…and are named in the per-button list", /label: `\$\{SOCIAL_LABELS\[k as SocialKey\] \?\? k\} icon`/.test(an));
const iconsSrc = read("src/components/public/social-icons.tsx");
check("the shared row imports no server code", [...iconsSrc.matchAll(/^import .* from "([^"]+)";/gm)].every((m) => ["@/lib/artist-fields", "@/lib/platform-logos", "@/lib/platforms", "@/lib/bio-themes", "@/lib/page-look"].includes(m[1])));

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
