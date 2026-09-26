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

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
