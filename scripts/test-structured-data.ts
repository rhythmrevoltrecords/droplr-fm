/**
 * Structured data, canonical addresses and the free release plan tool.
 *
 * What this defends:
 *  - the JSON-LD script tag is a trust boundary: a release title or bio typed as
 *    `</script><script>…` must stay a string, never close the tag;
 *  - the labels publish nothing the page doesn't show: no hidden store link, no social link from a
 *    page whose icon row is off, no http:// address, no empty fields;
 *  - every release page declares one canonical address (the label's own domain when it has one),
 *    so droplr.fm and a custom domain never compete for the same song;
 *  - cover art is crawlable while the rest of /api/ stays blocked;
 *  - the release plan tool is the dashboard's plan, not a copy of it, and its calendar file is
 *    valid RFC 5545: CRLF, folded at 75 octets, escaped, one all-day event per step.
 *
 * Pure functions and source checks. No database, no server:
 *   npx tsx scripts/test-structured-data.ts
 */
import { readFileSync } from "node:fs";
import { articleJsonLd, bioJsonLd, jsonLdHtml, releaseJsonLd, siteJsonLd, toolJsonLd } from "../src/lib/structured-data";
import { addDays, dateNotes, dayString, parseDay, planFor, planIcs, planText, relativeLabel, suggestedReleaseDay, TAB_LABELS } from "../src/lib/release-plan";
import { promoSteps } from "../src/lib/promo";
import { ALWAYS_CRAWLABLE, NEVER_INDEX, pageMeta, snippet, SITE_DESCRIPTION, SITE_TITLE } from "../src/lib/seo";
import { INDEXNOW_KEY_PATH, indexNowBatches, validIndexNowKey } from "../src/lib/indexnow";
import { llmsTxt } from "../src/lib/llms";
import { LEGAL_DOCS } from "../src/lib/legal";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(name);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` (${detail})`}`);
};
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const release = (over: Partial<Parameters<typeof releaseJsonLd>[0]> = {}) => ({
  kind: "release", title: "Again", artistName: "Ototo", coverUrl: "https://droplr.fm/api/cover/a.webp",
  releaseDate: new Date("2026-11-26T14:00:00Z"), isrc: "AUXYZ2600001", spotifyTrackId: null, spotifyAlbumId: null, ...over,
});
const opts = { url: "https://music.example.com/ototo-again", timezone: "Australia/Brisbane", storeUrls: ["https://open.spotify.com/track/x", "https://music.apple.com/x"], labelName: "Rhythm Revolt Records" };

console.log("1. The script tag");
{
  const evil = "</script><script>alert(1)</script>";
  const html = jsonLdHtml(releaseJsonLd(release({ title: evil, artistName: "<b>&" }), opts));
  check("a title can't close the script tag", !html.includes("</script") && !html.includes("<"), html.slice(0, 80));
  check("…and no raw > or & either", !html.includes(">") && !html.includes("&"));
  check("…and it still parses back to the exact title", JSON.parse(html).name === evil);
  const seps = jsonLdHtml({ name: "a\u2028b\u2029c" });
  check("JavaScript line separators are escaped", !seps.includes("\u2028") && !seps.includes("\u2029") && JSON.parse(seps).name === "a\u2028b\u2029c");
  const comp = src("src/components/seo/json-ld.tsx");
  check("the component renders through jsonLdHtml only", /__html: jsonLdHtml\(data\)/.test(comp) && !/JSON\.stringify/.test(comp));
  check("the component is not a client component", !comp.includes('"use client"'));
  const all = ["src/components/public/public-route.tsx", "src/components/public/bio-route.tsx", "src/app/page.tsx", "src/app/blog/[slug]/page.tsx", "src/app/learn/[slug]/page.tsx", "src/app/tools/release-plan/page.tsx"];
  check("no page writes ld+json by hand", all.every((f) => !src(f).includes("application/ld+json")));
}

console.log("1b. Release pages");
{
  const ld = releaseJsonLd(release(), opts) as Record<string, any>;
  check("a single with an ISRC is a MusicRecording", ld["@type"] === "MusicRecording");
  check("the ISRC is not published (no public page prints it)", !JSON.stringify(ld).includes("AUXYZ2600001"));
  check("released on the label's calendar day, not UTC's", ld.datePublished === "2026-11-27", ld.datePublished);
  check("the artist is named", ld.byArtist?.name === "Ototo");
  check("the canonical URL is the page URL", ld.url === opts.url);
  check("store links are sameAs", ld.sameAs?.length === 2);
  check("a label account names its label", ld.recordLabel?.name === "Rhythm Revolt Records");
  const artist = releaseJsonLd(release(), { ...opts, labelName: null }) as Record<string, any>;
  check("an artist's own account names no label", !("recordLabel" in artist));
  const http = releaseJsonLd(release({ coverUrl: "http://x/a.jpg" }), { ...opts, storeUrls: ["http://insecure.example/x", "https://open.spotify.com/a", "https://open.spotify.com/a"] }) as Record<string, any>;
  check("no http:// address and no duplicates", http.sameAs?.length === 1 && !("image" in http));
  const none = releaseJsonLd(release({ isrc: null }), { ...opts, storeUrls: [] }) as Record<string, any>;
  check("empty fields are left out, not null", !("sameAs" in none) && !Object.values(none).includes(null));
  const album = releaseJsonLd(release({ isrc: null, spotifyAlbumId: "abc" }), opts) as Record<string, any>;
  check("only an album id makes it a MusicAlbum", album["@type"] === "MusicAlbum");
  const gate = releaseJsonLd(release({ kind: "download" }), opts) as Record<string, any>;
  check("a download gate has no release day and no store copies", !("datePublished" in gate) && !("sameAs" in gate) && gate["@type"] === "MusicRecording");
  const pr = src("src/components/public/public-route.tsx");
  check("store links only once the page shows them (live, visible only)", /storeUrls: live \? release\.links\.map\(\(l\) => l\.url\) : \[\]/.test(pr) && /links: \{ where: \{ visible: true \}/.test(src("src/lib/releases.ts")));
  check("the release page passes its own live flag, the gate none", /\{ldFor\(live\)\}/.test(pr) && /\{ldFor\(false\)\}/.test(pr));
  check("release pages declare a canonical from publicReleaseUrl", /alternates: \{ canonical \}/.test(pr) && /const canonical = publicReleaseUrl\(/.test(pr));
  check("the JSON-LD and the canonical use the same address", /url: publicReleaseUrl\(org, release\.slug, SITE_URL\)/.test(pr));
}

console.log("1c. Bio pages");
{
  const ld = bioJsonLd({ title: "Ototo", bio: "Brisbane", imageUrl: "https://droplr.fm/api/cover/b.webp" }, { url: "https://droplr.fm/b/ototo", isLabel: false, socialUrls: ["https://instagram.com/ototo", "http://bad.example"] }) as Record<string, any>;
  check("a profile page about a musician", ld["@type"] === "ProfilePage" && ld.mainEntity["@type"] === "MusicGroup");
  check("only https social links", ld.mainEntity.sameAs.length === 1);
  const off = bioJsonLd({ title: "X", bio: null, imageUrl: "https://a/b.png" }, { url: "u", isLabel: true, socialUrls: [] }) as Record<string, any>;
  check("a label's own page is an Organization, with no empty fields", off.mainEntity["@type"] === "Organization" && !("sameAs" in off.mainEntity) && !("description" in off.mainEntity));
  const br = src("src/components/public/bio-route.tsx");
  check("social links come from the same lookup the icon row uses (null when the row is off)", /socialUrls: bioSocials\(socialLinks\)/.test(br) && /showSocials\(page\) \? socialSource/.test(br));
  check("the bio JSON-LD uses the bio canonical", /url: bioPublicUrl\(page\.organization, page\.slug\)/.test(br));
}

console.log("1d. Site, articles, tool");
{
  const site = siteJsonLd("https://droplr.fm");
  check("the homepage says what droplr is", site.some((s) => s["@type"] === "Organization") && site.some((s) => s["@type"] === "WebSite"));
  const a = articleJsonLd({ title: "T", summary: "S", url: "https://droplr.fm/blog/t", published: null, image: null, siteUrl: "https://droplr.fm" }) as Record<string, any>;
  check("an article names no person the page doesn't", a.author?.["@type"] === "Organization" && !JSON.stringify(a).includes("Person"));
  check("a guide without a date has no datePublished", !("datePublished" in a));
  const t = toolJsonLd({ name: "n", description: "d", url: "u" }) as Record<string, any>;
  check("the tool says it's free", t.isAccessibleForFree === true && t.offers.price === "0");
  const blog = src("src/app/blog/[slug]/page.tsx");
  check("blog posts set their own X card", /twitter: \{ card: "summary_large_image" as const, title: post\.title/.test(blog));
  check("guides set their own X card", /twitter: \{ card: "summary_large_image" as const, title: guide\.title/.test(src("src/app/learn/[slug]/page.tsx")));
}

console.log("2. Canonical addresses");
{
  const pages: [string, string][] = [
    ["src/app/page.tsx", "/"], ["src/app/pricing/page.tsx", "/pricing"], ["src/app/signup/page.tsx", "/signup"],
    ["src/app/docs/custom-domain/page.tsx", "/docs/custom-domain"], ["src/app/docs/spotify-byo/page.tsx", "/docs/spotify-byo"],
    ["src/app/legal/page.tsx", "/legal"], ["src/app/legal/terms/page.tsx", "/legal/terms"], ["src/app/legal/privacy/page.tsx", "/legal/privacy"],
    ["src/app/tools/release-plan/page.tsx", "/tools/release-plan"],
  ];
  const declares = (f: string, path: string) => {
    const t = src(f);
    if (t.includes(`canonical: "${path}"`) || t.includes(`path: "${path}"`)) return true;
    const legal = path.match(/^\/legal\/(.+)$/);
    return !!legal && t.includes(`legalMeta("${legal[1]}")`) && src("src/lib/legal-meta.ts").includes("path: `/legal/${d.slug}`");
  };
  for (const [f, path] of pages) check(`${path} declares itself canonical`, declares(f, path));
  check("pageMeta sets the canonical from its path", /alternates: \{ canonical: o\.path \}/.test(src("src/lib/seo.ts")));
  check("the root layout sets no canonical (every page would inherit it)", !/canonical/.test(src("src/app/layout.tsx")));
  const pricing = src("src/app/pricing/page.tsx");
  check("the pricing description reads its prices from the plan table", /PLAN_LIMITS\.artist\.price/.test(pricing) && !/A\$\d/.test(pricing.replace(/A\$\$\{/g, "")));
  check("…and gives a label the label floor (Pro), not the Label plan", /PLAN_LIMITS\.pro\.price\} for a label/.test(pricing));
  check("pricing: an own share card names the image again", /pageMeta\(\{ title: "Pricing"/.test(src("src/app/pricing/page.tsx")) && /images: \[SITE_CARD\.og\]/.test(src("src/lib/seo.ts")) && /images: \[SITE_CARD\.twitter\]/.test(src("src/lib/seo.ts")));
  for (const f of ["src/app/tools/release-plan/page.tsx", "src/app/learn/[slug]/page.tsx"]) {
    const s = src(f);
    check(`${f.split("/").slice(2, -1).join("/")}: an own share card names the image again`, /images: \[SITE_CARD\.og\]/.test(s) && /images: \[SITE_CARD\.twitter\]/.test(s));
  }
}

console.log("3. Robots");
{
  check("cover art is crawlable", (ALWAYS_CRAWLABLE as readonly string[]).includes("/api/cover/"));
  check("…while /api/ itself stays blocked", (NEVER_INDEX as readonly string[]).includes("/api/"));
  check("only cover art is carved out", ALWAYS_CRAWLABLE.length === 1);
  const robots = src("src/app/robots.ts");
  check("droplr.fm and tenant domains both allow it", (robots.match(/allow: \["\/", \.\.\.ALWAYS_CRAWLABLE\]/g) ?? []).length === 2);
  check("a deploy preview still blocks everything", /disallow: "\/" \}/.test(robots));
}

console.log("4. Release plan tool");
{
  check("a real date parses", parseDay("2026-11-27")?.toISOString() === "2026-11-27T00:00:00.000Z");
  check("an impossible date doesn't", parseDay("2026-02-30") === null && parseDay("27/11/2026") === null && parseDay("") === null && parseDay(null) === null);
  const thu = parseDay("2026-10-22")!;
  const sug = suggestedReleaseDay(thu);
  check("the suggested day is a Friday at least four weeks out", sug.getUTCDay() === 5 && sug.getTime() - thu.getTime() >= 28 * 86_400_000 && sug.getTime() - thu.getTime() < 35 * 86_400_000, dayString(sug));
  check("…and today itself counts when it's exactly four weeks to a Friday", dayString(suggestedReleaseDay(parseDay("2026-10-02")!)) === "2026-10-30");
  check("relative labels read like a person", relativeLabel(-28) === "4 weeks before" && relativeLabel(-7) === "1 week before" && relativeLabel(1) === "1 day after" && relativeLabel(0) === "Release day" && relativeLabel(-3) === "3 days before");

  const day = parseDay("2026-11-27")!;
  const plan = planFor(day, "artist", parseDay("2026-10-23")!);
  check("it is the dashboard's plan, step for step", JSON.stringify(plan.map((p) => p.key)) === JSON.stringify(promoSteps("artist").sort((a, b) => a.day - b.day).map((s) => s.key)));
  check("…with the dashboard's own words", plan.every((p) => promoSteps("artist").find((s) => s.key === p.key)!.body === p.body));
  check("release day is the date picked", plan.find((p) => p.day === 0)!.date === "2026-11-27");
  check("announce day is four weeks before", plan.find((p) => p.key === "announce")!.date === "2026-10-30");
  check("dates cross a month and a year correctly", plan.find((p) => p.key === "catalogue")!.date === "2027-01-26");
  check("nothing is late four weeks out", plan.every((p) => !p.past && p.status === "upcoming"));
  const late = planFor(day, "artist", parseDay("2026-11-10")!);
  check("17 days out, the early steps are late, still worth doing", late.filter((p) => p.past).length > 0 && late.filter((p) => p.past).every((p) => p.status === "late" && p.date < "2026-11-10") && late.find((p) => p.day === 0)!.status === "upcoming");
  const close = planFor(day, "artist", parseDay("2026-11-24")!);
  check("3 days out, the editorial pitch is missed, not 'do it now'", close.find((p) => p.key === "spotify-pitch")!.status === "missed" && close.find((p) => p.key === "countdown-7")!.status === "late");
  const after = planFor(day, "artist", parseDay("2026-12-01")!);
  check("after release day every pre-release step is missed, and release day itself is late", after.filter((p) => p.day < 0).every((p) => p.status === "missed") && after.find((p) => p.day === 0)!.status === "late" && after.find((p) => p.key === "playlists")!.status === "upcoming");
  check("a label gets the label's wording", planFor(day, "label", day).find((p) => p.key === "announce")!.body.includes("the artist's bio"));
  check("every tab a step points at has a name", promoSteps("label").every((s) => !s.tab || !!TAB_LABELS[s.tab]));

  check("a Friday four weeks out raises nothing", dateNotes(day, parseDay("2026-10-23")!).length === 0);
  check("a Thursday is flagged", dateNotes(parseDay("2026-11-26")!, parseDay("2026-10-23")!).some((n) => n.includes("Friday")));
  check("three days out warns about the Spotify pitch", dateNotes(day, parseDay("2026-11-24")!).some((n) => n.includes("7 days")));
  check("a past day says so", dateNotes(day, parseDay("2026-12-01")!).some((n) => n.includes("already passed")));

  const ics = planIcs(plan, { releaseTitle: "Again; the remix, part 1", stamp: new Date("2026-10-23T01:02:03Z"), site: "https://droplr.fm", id: "3f1c2a9e-0b7d-4c55-9a7e-2d8f6b1c0e44" });
  const lines = ics.split("\r\n");
  check("CRLF line endings throughout", !/[^\r]\n/.test(ics) && ics.endsWith("\r\n"));
  check("one event per step", (ics.match(/BEGIN:VEVENT/g) ?? []).length === plan.length);
  check("no line longer than 75 octets", lines.every((l) => new TextEncoder().encode(l).length <= 75), lines.find((l) => new TextEncoder().encode(l).length > 75));
  check("folded lines continue with a space", lines.slice(1).every((l) => l === "" || /^[A-Z ]/.test(l)));
  const unfolded = ics.replace(/\r\n /g, "");
  check("commas and semicolons are escaped", unfolded.includes("SUMMARY:Again\\; the remix\\, part 1: Announce it"));
  check("all-day events, ending the next day", unfolded.includes("DTSTART;VALUE=DATE:20261127") && unfolded.includes("DTEND;VALUE=DATE:20261128"));
  check("the year rolls over on the last day", unfolded.includes("DTSTART;VALUE=DATE:20270126") && unfolded.includes("DTEND;VALUE=DATE:20270127"));
  check("every UID is unique", new Set(unfolded.match(/UID:[^\r]+/g)).size === plan.length);
  const other = planIcs(plan, { releaseTitle: "Other", stamp: new Date(0), site: "s", id: "a-different-download" }).replace(/\r\n /g, "");
  const uids = (x: string) => new Set(x.match(/UID:[^\r]+/g));
  check("two plans for the same Friday share no UID (one can't overwrite the other)", [...uids(unfolded)].every((u) => !uids(other).has(u)));
  const longId = planIcs(plan, { releaseTitle: "x", stamp: new Date(0), site: "s", id: "x".repeat(70) });
  check("a long id is folded too", longId.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75));
  const afterIcs = planIcs(after, { releaseTitle: "x", stamp: new Date(0), site: "s", id: "i" });
  check("missed steps stay out of the calendar", (afterIcs.match(/BEGIN:VEVENT/g) ?? []).length === after.filter((p) => p.status !== "missed").length && !afterIcs.includes("Pitch to Spotify"));
  const emoji = planIcs(planFor(day, "artist", day), { releaseTitle: "🔥".repeat(40), stamp: new Date(0), site: "s", id: "i" });
  check("folding never splits a multi-byte character", !emoji.includes("�") && emoji.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75) && emoji.replace(/\r\n /g, "").includes("🔥".repeat(40)));
  check("copy as text lists every step with its date", planText(plan, "Again").split("\n")[0] === "Release plan: Again" && plan.every((p) => planText(plan, "").includes(`${p.date}  ${p.title}`)));
  check("addDays is calendar-exact", dayString(addDays(parseDay("2027-03-27")!, 1)) === "2027-03-28");

  const tool = src("src/components/tools/release-plan-tool.tsx");
  check("the tool never links into the dashboard", /it\.href\?\.startsWith\("https:\/\/"\)/.test(tool) && !tool.includes("/admin"));
  check("the tool sends nothing anywhere", !/fetch\(|XMLHttpRequest|sendBeacon/.test(tool));
  check("the default date is picked in the browser, not during render", /useEffect\(\(\) => \{\s*const t = localToday\(\)/.test(tool));
  check("the notes live region is always mounted", /<div role="status" aria-live="polite">\s*\{notes\.length > 0/.test(tool));
  check("only a late step says 'do it now'", /it\.status === "late" && <span[^>]*>late, do it now/.test(tool) && !/it\.past && <span/.test(tool));
  const toolPage = src("src/app/tools/release-plan/page.tsx");
  check("the tool page doesn't promise reminders or imply everything is free", !/reminds you/.test(toolPage) && /need a paid plan/.test(toolPage));
  const page = src("src/app/tools/release-plan/page.tsx");
  check("the tool page is static", page.includes('export const dynamic = "force-static"'));
  check("it is in the sitemap", src("src/app/sitemap.xml/route.ts").includes('url("/tools/release-plan")'));
  check("and linked from every marketing page's footer", src("src/components/marketing/site-chrome.tsx").includes('href="/tools/release-plan"'));
  // The roadmap moved off the homepage to its own page (25 Oct): it has to stay findable.
  check("/roadmap is in the sitemap", src("src/app/sitemap.xml/route.ts").includes('url("/roadmap")'));
  check("/roadmap is in the header nav and the footer", src("src/components/marketing/site-chrome.tsx").includes('href: "/roadmap"') && src("src/components/marketing/site-chrome.tsx").includes('href="/roadmap"'));
  // Spotify only lets a new app save for 5 allowlisted people; the homepage must never promise saves.
  check("the homepage never says Spotify saves land", !/Spotify saves land/i.test(src("src/app/page.tsx")));
}

console.log("5. IndexNow");
{
  check("a real key is accepted", validIndexNowKey("a1b2c3d4e5f6a7b8") === "a1b2c3d4e5f6a7b8" && validIndexNowKey(" abcd-1234 ") === "abcd-1234");
  check("a short, long or odd key is treated as unset", validIndexNowKey("short") === null && validIndexNowKey("x".repeat(129)) === null && validIndexNowKey("has space1") === null && validIndexNowKey(undefined) === null && validIndexNowKey("") === null);
  const b = indexNowBatches(["https://droplr.fm/a/b", "https://music.example.com/x", "https://droplr.fm/a/b", "https://droplr.fm/b/c", null, "http://droplr.fm/insecure", "not a url"], "k1234567");
  check("one request per host", b.length === 2 && b.map((x) => x.host).sort().join() === "droplr.fm,music.example.com");
  const dr = b.find((x) => x.host === "droplr.fm")!;
  check("each names its own host's key file", dr.keyLocation === `https://droplr.fm${INDEXNOW_KEY_PATH}` && b.find((x) => x.host === "music.example.com")!.keyLocation === "https://music.example.com/indexnow-key.txt");
  check("deduplicated, https only, junk dropped", dr.urlList.length === 2 && !b.some((x) => x.urlList.some((u) => u.startsWith("http:"))));
  check("nothing to send, no request", indexNowBatches([null, undefined, ""], "k1234567").length === 0);
  check("a host is matched case-insensitively", indexNowBatches(["https://DROPLR.fm/a", "https://droplr.fm/b"], "k1234567").length === 1);

  const server = src("src/lib/indexnow-server.ts");
  check("off unless indexable and keyed", /if \(!key \|\| !seoIndexable\(\)\) return;/.test(server));
  check("a send can't hang a request", /AbortSignal\.timeout\(5000\)/.test(server) && /catch \(e\)/.test(server));
  check("addresses come from the canonical builders, not a copy", /publicReleaseUrl\(r\.organization, r\.slug, SITE_URL\)/.test(server) && /bioPublicUrl\(p\.organization, p\.slug\)/.test(server));
  check("a release is only announced when public AND live (the sitemap's own rule)", /r && r\.isPublic && r\.status === "live" && !r\.organization\.suspendedAt \? publicReleaseUrl/.test(server) && /where: \{ isPublic: true, status: "live", organization: NOT_SUSPENDED \}/.test(src("src/app/sitemap-releases.xml/route.ts")));
  // The behaviour (no music, suspended) is exercised for real in test-suspend.ts.
  check("a bio page only when public, not suspended and with music (the bio sitemap's own rule)", /p && p\.isPublic && !p\.organization\.suspendedAt && p\.organization\._count\.releases > 0 \? bioPublicUrl/.test(server));
  check("a lookup failure is null, never a throw (the release-day job awaits it)", (server.match(/catch \{\s*return null;\s*\}/g) ?? []).length === 2);
  for (const f of ["src/app/api/admin/releases/[id]/route.ts", "src/app/api/admin/bio/[id]/route.ts", "src/app/api/admin/downloads/[id]/route.ts"]) {
    const t = src(f);
    check(`${f.replace("src/app/api/admin/", "")}: no extra lookup when IndexNow is off`, !/const before = await/.test(t) && /const before = indexNowOn\(\) \?/.test(t));
  }
  check("relative imports only (bundled outside Next)", !/from "@\//.test(server) && !/from "@\//.test(src("src/lib/release-url.ts")));
  const keyRoute = src("src/app/indexnow-key.txt/route.ts");
  check("the key file 404s until a key is set", /if \(!key\) return new Response\("Not found", \{ status: 404 \}\)/.test(keyRoute));
  check("the key file is served on every host (middleware skips .txt)", /\.\*\\\\\.\(\?:[^)]*\btxt\b/.test(src("src/middleware.ts")));
  const hooks: [string, RegExp][] = [
    ["src/app/api/admin/releases/route.ts", /after\(async \(\) => pingIndexNow\(\[await releaseAddress\(release\.id\)\]\)\)/],
    ["src/app/api/admin/releases/[id]/route.ts", /const before = indexNowOn\(\) \? await releaseAddress\(g\.release\.id\) : null;\s*await prisma\.(?:\$transaction\(\[\s*prisma\.)?release\.update[\s\S]*?pingIndexNow\(\[before, await releaseAddress\(g\.release\.id\)\]\)/],
    ["src/app/api/admin/releases/[id]/route.ts", /const before = indexNowOn\(\) \? await releaseAddress\(g\.release\.id\) : null;\s*await prisma\.release\.delete[\s\S]*?pingIndexNow\(\[before\]\)/],
    ["src/app/api/admin/downloads/[id]/route.ts", /const before = indexNowOn\(\) \? await releaseAddress\(id\) : null;[\s\S]*?pingIndexNow\(\[before, await releaseAddress\(id\)\]\)/],
    ["src/app/api/admin/downloads/[id]/route.ts", /const before = indexNowOn\(\) \? await releaseAddress\(existing\.id\) : null;\s*await prisma\.release\.delete[\s\S]*?pingIndexNow\(\[before\]\)/],
    ["src/app/api/admin/releases/[id]/links/route.ts", /pingIndexNow\(\[await releaseAddress\(g\.release\.id\)\]\)/],
    ["src/app/api/admin/downloads/route.ts", /pingIndexNow\(\[await releaseAddress\(created\.id\)\]\)/],
    ["src/app/api/admin/bio/route.ts", /pingIndexNow\(\[await bioAddress\(page\.id\)\]\)/],
    ["src/app/api/admin/bio/[id]/route.ts", /const before = indexNowOn\(\) \? await bioAddress\(g\.page\.id\) : null;\s*await prisma\.bioPage\.update[\s\S]*?pingIndexNow\(\[before, await bioAddress\(g\.page\.id\)\]\)/],
    ["src/app/api/admin/bio/[id]/route.ts", /const before = indexNowOn\(\) \? await bioAddress\(g\.page\.id\) : null;\s*await prisma\.bioPage\.delete[\s\S]*?pingIndexNow\(\[before\]\)/],
    ["src/lib/presave-processor.ts", /data: \{ status: "live" \} \}\);[\s\S]{0,300}await pingIndexNow\(\[await releaseAddress\(releaseId\)\]\)/],
  ];
  for (const [f, re] of hooks) check(`announces from ${f.replace("src/", "").replace("/route.ts", "")}${/delete/.test(re.source) ? " (delete)" : /update|transaction|\[before, /.test(re.source) ? " (edit)" : ""}`, re.test(src(f)));
  check("bio links (both blocks) announce", (src("src/app/api/admin/bio/[id]/links/route.ts").match(/pingIndexNow\(\[await bioAddress\(page\.id\)\]\)/g) ?? []).length === 2);
}

console.log("6. llms.txt and page descriptions");
{
  const txt = llmsTxt({
    site: "https://droplr.fm", title: SITE_TITLE, description: SITE_DESCRIPTION,
    plans: [{ audience: "Artist", tiers: [{ name: "Artist", price: "A$12", blurb: "x" }] }],
    guides: [{ slug: "g", title: "Guide", summary: "S" }], posts: [],
  });
  check("starts with the site's own title and description", txt.startsWith(`# ${SITE_TITLE}\n\n> ${SITE_DESCRIPTION}`));
  check("prices come from the input, guides link to /learn", txt.includes("### For artists") && txt.includes("- Artist (A$12): x") && txt.includes("[Guide](https://droplr.fm/learn/g)"));
  check("no empty blog section", !txt.includes("## News and guides"));
  const route = src("src/app/llms.txt/route.ts");
  check("llms.txt 404s on a label's domain", /!== "platform"\) return new Response\("Not found", \{ status: 404 \}\)/.test(route));
  check("it's generated from the plan table, guides and live posts", /pricingTiers\(\)/.test(route) && /GUIDES\.map/.test(route) && /livePosts\(new Date\(\)\)/.test(route));
  check("no 'we' in the generated copy", !/\bwe\b/i.test(src("src/lib/llms.ts").split("export function")[1]));
  check("the layout and llms.txt share one title and description", /SITE_DESCRIPTION as DESCRIPTION, SITE_TITLE as TITLE/.test(src("src/app/layout.tsx")));

  const m = pageMeta({ title: "Legal", description: "d", path: "/legal" });
  check("pageMeta: own canonical, card and image", m.alternates.canonical === "/legal" && m.openGraph.images[0] === "/opengraph-image" && m.twitter.images[0] === "/twitter-image" && m.openGraph.title === "Legal · droplr.fm");
  for (const [f, path] of [["src/app/blog/page.tsx", "/blog"], ["src/app/learn/page.tsx", "/learn"], ["src/app/b/page.tsx", "/b"], ["src/app/signup/page.tsx", "/signup"], ["src/app/legal/page.tsx", "/legal"], ["src/app/docs/custom-domain/page.tsx", "/docs/custom-domain"], ["src/app/docs/spotify-byo/page.tsx", "/docs/spotify-byo"], ["src/app/pricing/page.tsx", "/pricing"]] as const) {
    check(`${path} has its own description and card`, new RegExp(`pageMeta\\(\\{[^}]*path: "${path.replace(/\//g, "\\/")}"`).test(src(f)));
  }
  for (const d of LEGAL_DOCS) check(`/legal/${d.slug} reads its description from LEGAL_DOCS`, src(`src/app/legal/${d.slug}/page.tsx`).includes(`legalMeta("${d.slug}")`));
  check("no legal blurb says 'we'", LEGAL_DOCS.every((d) => !/\bwe\b/i.test(d.blurb)));
  check("the gallery keeps its noindex until it has pages", /robots: enough \? undefined : \{ index: false, follow: true \}/.test(src("src/app/b/page.tsx")));
  check("every description in pageMeta calls is under 160", [...[
    "src/app/blog/page.tsx", "src/app/learn/page.tsx", "src/app/b/page.tsx", "src/app/signup/page.tsx", "src/app/legal/page.tsx", "src/app/docs/custom-domain/page.tsx", "src/app/docs/spotify-byo/page.tsx",
  ].flatMap((f) => [...src(f).matchAll(/description: "([^"]+)"/g)].map((x) => x[1]))].every((d) => d.length <= 160));

  check("a short description is left alone", snippet("Short.") === "Short.");
  const long = "First sentence is here and it is fairly long to make a point about cutting. Second sentence goes on well past the limit so the cut has to happen somewhere sensible here.";
  check("a long one is cut at the last whole sentence", snippet(long) === "First sentence is here and it is fairly long to make a point about cutting.");
  const noStop = "word ".repeat(60).trim();
  const cut = snippet(noStop);
  check("…or at a word, with an ellipsis", cut.length <= 156 && cut.endsWith("…") && !cut.includes("wor…"));
  const blog = src("src/app/blog/[slug]/page.tsx");
  check("blog posts: title without the suffix, trimmed description", /title: \{ absolute: post\.title \}/.test(blog) && /const description = snippet\(post\.summary\)/.test(blog));
  check("blog posts are built ahead and cached", /export function generateStaticParams\(\)/.test(blog) && /export const dynamicParams = true/.test(blog) && /export const revalidate = 300/.test(blog));
  const sm = src("src/app/sitemap.xml/route.ts");
  check("no sitemap entry claims to have changed 'now'", !/lastmod: now/.test(sm));
  check("/blog and /learn carry their newest real date", /url\("\/blog"\), lastmod: newest\(/.test(sm) && /url\("\/learn"\), lastmod: newest\(/.test(sm));
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
