/**
 * Indexing and discovery.
 *
 * What this defends:
 *  - the eleven /learn guides are crawlable and in the sitemap — they are the only organic
 *    acquisition channel, and they were silently noindex for months because the robots rule was
 *    wired to SIGNUPS_OPEN;
 *  - nothing behind a login, and nothing with a token in the URL, is ever crawlable or listed.
 *    An /invite or /report token in a search index is that private link handed to a stranger;
 *  - a Netlify deploy preview refuses every crawler, so a preview build can't outrank the site
 *    it previews;
 *  - a tenant's custom domain is never given droplr.fm's sitemap.
 *
 * Local database only. Never point it at Neon.
 */
import { readFileSync } from "node:fs";
import { GUIDES } from "../src/lib/learn";
import { LEGAL_DOCS } from "../src/lib/legal";
import { NEVER_INDEX, robotsAudience, seoIndexable } from "../src/lib/seo";

for (const name of ["NETLIFY_DATABASE_URL", "DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  const raw = process.env[name];
  if (!raw) continue;
  let host = "";
  try { host = new URL(raw).hostname; } catch { host = raw; }
  if (host.includes("neon.tech") && process.env.ALLOW_PROD_TEST !== "1") {
    console.error(`Refusing to run: ${name} points at ${host} (production).`);
    process.exit(1);
  }
}

// ---- bio pages are allowed to be found -----------------------------------
//
// /b/ sat in NEVER_INDEX next to /admin and /invite. That list is for signed-in surfaces and for
// URLs where the token IS the credential; a bio page is a public page an artist puts in their
// Instagram bio. Being absent from Google was never a decision about bio pages — it was a line
// in a list, and the competitor whose FAQ answers "can people find my page on Google?" says yes.
{
  const fail = (m: string) => { console.error(`  \u2717 ${m}`); process.exit(1); };
  if ((NEVER_INDEX as readonly string[]).includes("/b/")) fail("bio pages must not be blocked from search");
  // The three that stay, and why: two are not pages and one is an internal rewrite target.
  for (const p of ["/admin", "/dashboard", "/platform", "/invite", "/report", "/api/", "/r/", "/host/"]) {
    if (!(NEVER_INDEX as readonly string[]).includes(p)) fail(`${p} must stay out of the index`);
  }

  const route = readFileSync(new URL("../src/components/public/bio-route.tsx", import.meta.url), "utf8");
  // One page, one address. The same page answers on droplr.fm and on a custom domain, and letting
  // both in makes a page compete with itself for its own name.
  if (!/alternates: \{ canonical: bioPublicUrl\(/.test(route)) fail("every bio page must declare one canonical URL");

  const sitemap = readFileSync(new URL("../src/app/sitemap-bio.xml/route.ts", import.meta.url), "utf8");
  if (!/isPublic: true/.test(sitemap)) fail("the bio sitemap must list public pages only");
  if (!/audience === "blocked"/.test(sitemap)) fail("the bio sitemap must 404 on a blocked host");
  if (!/audience === "platform" \? !!domain : domain !== host/.test(sitemap)) fail("the bio sitemap must list only what its own host serves");
  if (!/status: 503/.test(sitemap)) fail("a database failure must 503, not claim there are no pages");

  const robots = readFileSync(new URL("../src/app/robots.ts", import.meta.url), "utf8");
  if (!robots.includes("sitemap-bio.xml")) fail("robots.txt must point at the bio sitemap");
  if (!/\$\{self\}\/sitemap-bio\.xml/.test(robots)) fail("a tenant host must be given its OWN bio sitemap, not droplr.fm's");
  console.log("  \u2713 bio pages are indexable, canonical and in a host-correct sitemap");
}

// ---- a dead link says what it is -----------------------------------------
//
// A 404 used to carry no metadata, so it inherited the site default. On a label's own domain that
// meant a broken link opened a tab reading "droplr.fm — Launch every release like a label would",
// which is droplr's marketing headline on somebody else's address — and it is what made a routine
// 404 look like a custom-domain outage for half an hour.
{
  const fail = (m: string) => { console.error(`  \u2717 ${m}`); process.exit(1); };
  const bio = readFileSync(new URL("../src/components/public/bio-route.tsx", import.meta.url), "utf8");
  const rel = readFileSync(new URL("../src/components/public/public-route.tsx", import.meta.url), "utf8");
  for (const [name, src] of [["bio", bio], ["release", rel]] as const) {
    if (!src.includes("NOT_FOUND_TITLE")) fail(`a missing ${name} page must carry its own title`);
    if (!/absolute: NOT_FOUND_TITLE/.test(src)) fail(`the ${name} 404 title must be absolute, not suffixed with droplr.fm on a label's domain`);
    if (!/robots: \{ index: false, follow: false \}/.test(src)) fail(`a missing ${name} page must not invite indexing`);
  }
  const page = readFileSync(new URL("../src/app/not-found.tsx", import.meta.url), "utf8");
  if (!page.includes("Nobody&apos;s in this room")) fail("the 404 page and its title must say the same thing");
  console.log("  \u2713 a dead link carries its own title on every host");
}

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
let pass = 0; const fails: string[] = [];
const check = (n: string, ok: boolean, d = "") => { ok ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`); console.log(`${ok ? "  ✓" : "  ✗"} ${n}${!ok && d ? ` (${d})` : ""}`); };
const get = async (p: string, host?: string) => {
  const r = await fetch(`${BASE}${p}`, { redirect: "manual", headers: host ? { "x-forwarded-host": host } : {} });
  return { status: r.status, body: await r.text() };
};
const withEnv = <T,>(vars: Record<string, string | undefined>, fn: () => T): T => {
  const old = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try { return fn(); } finally { for (const [k, v] of Object.entries(old)) v === undefined ? delete process.env[k] : (process.env[k] = v); }
};

async function main() {
  // --- the gate itself ---
  check("indexable by default", withEnv({ SEO_NOINDEX: undefined, CONTEXT: undefined }, seoIndexable));
  check("SEO_NOINDEX=true pulls the site out", withEnv({ SEO_NOINDEX: "true", CONTEXT: undefined }, () => !seoIndexable()));
  check("Netlify production is indexable", withEnv({ SEO_NOINDEX: undefined, CONTEXT: "production" }, seoIndexable));
  for (const ctx of ["deploy-preview", "branch-deploy"]) {
    check(`Netlify ${ctx} is not indexable`, withEnv({ SEO_NOINDEX: undefined, CONTEXT: ctx }, () => !seoIndexable()));
  }
  // Signups being closed must no longer make the site invisible — that was the bug.
  check("closed signups do not block indexing", withEnv({ SIGNUPS_OPEN: undefined, SEO_NOINDEX: undefined, CONTEXT: undefined }, seoIndexable));

  // --- which robots.txt a host gets ---
  const clean = { SEO_NOINDEX: undefined, CONTEXT: undefined };
  check("droplr.fm is the platform", withEnv(clean, () => robotsAudience("droplr.fm") === "platform"));
  check("www.droplr.fm is the platform", withEnv(clean, () => robotsAudience("www.droplr.fm") === "platform"));
  check("a tenant subdomain is a tenant", withEnv(clean, () => robotsAudience("someone.droplr.fm") === "tenant"));
  check("a tenant custom domain is a tenant", withEnv(clean, () => robotsAudience("music.somelabel.com") === "tenant"));
  check("a Netlify preview host is blocked", withEnv(clean, () => robotsAudience("abc123--droplr-fm.netlify.app") === "blocked"));
  check("SEO_NOINDEX blocks even droplr.fm", withEnv({ SEO_NOINDEX: "true", CONTEXT: undefined }, () => robotsAudience("droplr.fm") === "blocked"));

  // --- robots.txt as served ---
  const robots = await get("/robots.txt");
  check("robots.txt is served", robots.status === 200, String(robots.status));
  check("robots.txt allows crawling", /^Allow: \/$/m.test(robots.body), robots.body.slice(0, 200));
  check("robots.txt points at the sitemap", robots.body.includes("/sitemap.xml"));
  check("robots.txt points at the release sitemap", robots.body.includes("/sitemap-releases.xml"));
  for (const p of NEVER_INDEX) {
    check(`robots.txt disallows ${p}`, robots.body.includes(`Disallow: ${p}`), robots.body.slice(0, 400));
  }
  for (const open of ["/learn", "/pricing", "/legal"]) {
    check(`robots.txt does not disallow ${open}`, !new RegExp(`^Disallow: ${open}$`, "m").test(robots.body));
  }

  // --- sitemap.xml ---
  const sm = await get("/sitemap.xml");
  check("sitemap.xml is served", sm.status === 200, String(sm.status));
  check("sitemap is XML", sm.body.includes("<urlset"), sm.body.slice(0, 120));
  check("sitemap has the home page", sm.body.includes("<loc>" + BASE + "</loc>") || sm.body.includes(">" + BASE + "/<"));
  for (const g of GUIDES) check(`sitemap lists /learn/${g.slug}`, sm.body.includes(`/learn/${g.slug}<`));
  check(`sitemap lists all ${GUIDES.length} guides`, (sm.body.match(/\/learn\//g) || []).length >= GUIDES.length);
  for (const p of ["/pricing", "/learn", "/docs/custom-domain", "/docs/spotify-byo"]) {
    check(`sitemap lists ${p}`, sm.body.includes(`${p}<`));
  }
  for (const d of LEGAL_DOCS) check(`sitemap lists /legal/${d.slug}`, sm.body.includes(`/legal/${d.slug}<`));
  // The other half: a sitemap that leaks a private URL is worse than no sitemap.
  for (const p of ["/admin", "/dashboard", "/platform", "/invite", "/report", "/login", "/reset-password", "/forgot-password", "/demo"]) {
    check(`sitemap never lists ${p}`, !sm.body.includes(`${p}`), "leaked");
  }

  // --- an empty sitemap is a 404, never an empty urlset ---
  // sitemaps.org requires at least one <url>; Google reports an empty urlset as malformed
  // rather than "nothing yet", which is exactly what droplr.fm's release sitemap did on the
  // day it was submitted, because the only release on the platform was still upcoming.
  const rel = await get("/sitemap-releases.xml");
  check("release sitemap is 200 or 404, never empty", rel.status === 200 || rel.status === 404, String(rel.status));
  check("release sitemap never serves an empty urlset", !(rel.status === 200 && !rel.body.includes("<url>")), rel.body.slice(0, 200));
  if (rel.status === 200) check("release sitemap is XML", rel.body.includes("<urlset"), rel.body.slice(0, 120));
  check("sitemap.xml is never an empty urlset", sm.body.includes("<url>"));

  // --- a sitemap only ever lists URLs on its own host ---
  for (const [name, r] of [["sitemap.xml", sm], ["sitemap-releases.xml", rel]] as const) {
    if (r.status !== 200) continue;
    const locs = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const foreign = locs.filter((l) => !l.startsWith(BASE));
    check(`${name} lists only ${BASE} URLs`, foreign.length === 0, foreign.slice(0, 3).join(", "));
  }

  // --- a tenant custom domain gets its own answers, never droplr.fm's ---
  const tenantHost = "presave.somelabel.example";
  const tRobots = await get("/robots.txt", tenantHost);
  check("tenant robots.txt is served", tRobots.status === 200, String(tRobots.status));
  check("tenant robots.txt never offers droplr.fm's sitemap", !tRobots.body.includes(`${BASE}/sitemap`), tRobots.body);
  check("tenant robots.txt points at its own sitemap", tRobots.body.includes(`${tenantHost}/sitemap-releases.xml`), tRobots.body);
  check("tenant robots.txt still hides the app", tRobots.body.includes("Disallow: /admin"));
  const tSitemap = await get("/sitemap.xml", tenantHost);
  check("tenant /sitemap.xml is a 404, not droplr.fm's pages", tSitemap.status === 404, String(tSitemap.status));
  const tRel = await get("/sitemap-releases.xml", tenantHost);
  check("tenant release sitemap never lists another host", tRel.status !== 200 || !tRel.body.includes(BASE), String(tRel.status));

  // --- a Netlify preview host refuses everything ---
  const pHost = "abc123--droplr-fm.netlify.app";
  const pRobots = await get("/robots.txt", pHost);
  check("preview robots.txt disallows everything", /^Disallow: \/$/m.test(pRobots.body), pRobots.body);
  check("preview robots.txt offers no sitemap", !pRobots.body.includes("Sitemap:"), pRobots.body);
  check("preview /sitemap.xml is a 404", (await get("/sitemap.xml", pHost)).status === 404);
  check("preview release sitemap is a 404", (await get("/sitemap-releases.xml", pHost)).status === 404);

  // --- what the pages themselves say ---
  const noindexed = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i;
  for (const p of ["/login", "/forgot-password", "/demo/demo-track"]) {
    const r = await get(p);
    check(`${p} says noindex`, r.status === 200 && noindexed.test(r.body), String(r.status));
  }
  for (const p of ["/", "/pricing", "/learn", `/learn/${GUIDES[0].slug}`]) {
    const r = await get(p);
    check(`${p} is indexable`, r.status === 200 && !noindexed.test(r.body), String(r.status));
  }
  const guide = await get(`/learn/${GUIDES[0].slug}`);
  check("a guide has a canonical", /<link[^>]+rel="canonical"[^>]+\/learn\//i.test(guide.body));
  check("a guide has an OG title", /property="og:title"/i.test(guide.body));

  // --- signed-in and token surfaces set noindex in source ---
  // They redirect to /login for a crawler, so this is the assertion that survives that redirect
  // ever being loosened.
  const gated: [string, string][] = [
    ["/admin", "src/app/admin/layout.tsx"],
    ["/dashboard", "src/app/dashboard/layout.tsx"],
    ["/platform", "src/app/platform/layout.tsx"],
    ["/invite/[token]", "src/app/invite/[token]/page.tsx"],
    ["/report/[token]", "src/app/report/[token]/page.tsx"],
    ["/reset-password", "src/app/reset-password/page.tsx"],
  ];
  for (const [route, file] of gated) {
    const src = readFileSync(file, "utf8");
    check(`${route} declares noindex`, src.includes("NOINDEX"), file);
  }

  // --- marketing pages must stay statically rendered ---
  // Reading searchParams, cookies or headers in a page opts the whole route out of static rendering
  // in Next 15. /pricing did exactly that — for one query param that preselected a tab — and paid a
  // serverless invocation per view with `no-store`, measured at 288ms-3.3s against 38ms for every
  // other marketing page. It is the page people decide to pay on, and the regression is invisible
  // in review: nothing breaks, it just quietly stops being cached.
  const MUST_BE_STATIC: [string, string][] = [
    ["/", "src/app/page.tsx"],
    ["/pricing", "src/app/pricing/page.tsx"],
    ["/learn", "src/app/learn/page.tsx"],
    ["/legal", "src/app/legal/page.tsx"],
  ];
  // Comments are stripped first: these files explain why they avoid these APIs, and a naive string
  // match would fail on the explanation.
  const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const [route, file] of MUST_BE_STATIC) {
    const code = withoutComments(readFileSync(file, "utf8"));
    const dynamicBits = ["searchParams", "cookies(", "headers(", 'dynamic = "force-dynamic"', "noStore("];
    const found = dynamicBits.filter((b) => code.includes(b));
    check(`${route} stays static (nothing that forces dynamic rendering)`, found.length === 0, found.join(", "));
  }

  // --- a domain the account moved away from ---
  // Its pages 308 to the new domain, but robots.txt and the sitemaps never reach that resolver (the
  // middleware skips .txt/.xml), so they kept advertising and serving empty sitemaps: crawlers asked
  // for them on every visit and logged a 404 each time (seen on presave.rhythmrevoltrecords.com).
  if (/neon\.tech|neon\.build/i.test(`${process.env.DATABASE_URL ?? ""}${process.env.NETLIFY_DATABASE_URL ?? ""}`)) throw new Error("Refusing to run against Neon.");
  const { prisma } = await import("../src/lib/db");
  const tag = `seotest-${Date.now()}`;
  const oldHost = `old-${tag}.example`, newHost = `new-${tag}.example`;
  const moved = await prisma.organization.create({ data: { name: "Moved", slug: tag, plan: "label", customDomain: newHost, customDomainLiveAt: new Date(), previousDomains: [oldHost] } });
  try {
    const oldRobots = await get("/robots.txt", oldHost);
    check("an old domain's robots.txt lets crawlers in to follow the redirects", oldRobots.status === 200 && /^Allow: \/$/m.test(oldRobots.body), oldRobots.body.slice(0, 120));
    check("…and advertises no sitemap", !/Sitemap:/i.test(oldRobots.body), oldRobots.body);
    const newRobots = await get("/robots.txt", newHost);
    check("the current domain still advertises its sitemaps (control)", newRobots.body.includes(`://${newHost}/sitemap-releases.xml`), newRobots.body.slice(-200));
    for (const f of ["sitemap-releases.xml", "sitemap-bio.xml"]) {
      const r = await fetch(`${BASE}/${f}`, { redirect: "manual", headers: { "x-forwarded-host": oldHost } });
      check(`an old domain's ${f} redirects to the new domain's`, r.status === 308 && r.headers.get("location") === `https://${newHost}/${f}`, `${r.status} ${r.headers.get("location")}`);
    }
    await prisma.organization.update({ where: { id: moved.id }, data: { customDomain: null, customDomainLiveAt: null } });
    const nowhere = await fetch(`${BASE}/sitemap-releases.xml`, { redirect: "manual", headers: { "x-forwarded-host": oldHost } });
    check("with no live domain to point at, the old sitemap is gone (410)", nowhere.status === 410, String(nowhere.status));
  } finally {
    await prisma.organization.delete({ where: { id: moved.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
