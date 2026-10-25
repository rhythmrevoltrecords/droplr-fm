/**
 * The Content-Security-Policy (next.config.mjs) against every kind of page, in a real browser.
 * Run: npm run test:csp (needs local Postgres and a production server on :3000; never Neon).
 *
 * A CSP that is too tight fails silently: a label's pixel stops counting, a video won't play, and
 * nothing errors on the server. So this loads each page type with all three pixels switched on,
 * presses play where there is a player, and fails on any violation the browser reports.
 */
import { createRequire } from "node:module";

// Playwright is not a project dependency: it is pre-installed in the cloud sandbox where the browser
// suites run. Loaded at runtime with just the shapes this file uses, so the build never needs it.
type Page = {
  goto(u: string, o: object): Promise<{ status(): number } | null>;
  on(e: "console", f: (m: { text(): string }) => void): void;
  on(e: "request", f: (r: { url(): string }) => void): void;
  locator(s: string): { first(): { click(o: object): Promise<void> } };
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(f: (() => T) | string): Promise<T>;
  close(): Promise<void>;
};
type Ctx = { addCookies(c: object[]): Promise<void>; addInitScript(f: () => void): Promise<void>; newPage(): Promise<Page> };
type Browser = { newContext(o: object): Promise<Ctx>; close(): Promise<void> };
const { chromium } = createRequire(import.meta.url)("playwright") as { chromium: { launch(o: object): Promise<Browser> } };

const BASE = process.env.TEST_BASE ?? "http://localhost:3000";
let pass = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  ✓ ${name}`); } else { fails.push(name); console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`); }
}

async function main() {
  if (/neon\.tech|neon\.build/i.test(`${process.env.DATABASE_URL ?? ""}${process.env.NETLIFY_DATABASE_URL ?? ""}`)) {
    console.error("Refusing to run against Neon.");
    process.exit(1);
  }
  const { prisma } = await import("../src/lib/db");
  const { signToken } = await import("../src/lib/crypto");
  const { enableReport } = await import("../src/lib/report");
  const { POSTS } = await import("../src/lib/blog");

  const tag = `csptest-${Date.now()}`;
  const org = await prisma.organization.create({
    data: { name: "CSP Test", slug: tag, plan: "label", metaPixelId: "123456789012345", tiktokPixelId: "C1A2B3C4D5E6F7G8H9I0", ga4Id: "G-AB12CD34EF" },
  });
  // The pixel scripts must really load, or there is nothing to violate. In the cloud sandbox the
  // outbound proxy re-signs TLS, hence ignoreHTTPSErrors there only.
  const proxied = !!process.env.HTTPS_PROXY;
  const browser = await chromium.launch({});
  try {
    const user = await prisma.user.create({ data: { email: `${tag}@example.com`, passwordHash: "x", role: "owner", organizationId: org.id, emailVerifiedAt: new Date() } });
    const day = 86400_000;
    const mk = (slug: string, kind: string, releaseDate: Date) =>
      prisma.release.create({ data: { organizationId: org.id, slug: `${tag}-${slug}`, title: slug, artistName: "A", coverUrl: "https://example.com/c.jpg", releaseDate, kind, ...(kind === "download" ? { downloadUrl: "https://example.com/f.zip" } : {}) } });
    const presave = await mk("presave", "release", new Date(Date.now() + 7 * day));
    const smart = await mk("smart", "release", new Date(Date.now() - 7 * day));
    const gate = await mk("gate", "download", new Date(Date.now() - day));
    await prisma.releaseLink.create({ data: { releaseId: smart.id, platform: "spotify", url: "https://open.spotify.com/album/x", position: 0 } }).catch(() => null);
    const bio = await prisma.bioPage.create({ data: { organizationId: org.id, slug: tag, title: "CSP", imageUrl: "https://example.com/i.jpg" } });
    await prisma.bioLink.create({ data: { bioPageId: bio.id, platform: "youtube", url: "https://www.youtube.com/watch?v=iJsZ2ddOAU8", section: "video", highlight: "on", label: "CSP video" } }).catch((e) => console.log("  (no video block:", e instanceof Error ? e.message.split("\n").pop() : e, ")"));
    const report = await enableReport(smart.id);
    const session = await signToken({ sub: user.id, org: org.id, role: "owner", jti: crypto.randomUUID() }, "1h", "session");

    const ctx = await browser.newContext({ ignoreHTTPSErrors: proxied });
    await ctx.addCookies([{ name: "dfm_session", value: session, url: BASE }]);
    await ctx.addInitScript(() => {
      (window as unknown as { __csp: string[] }).__csp = [];
      document.addEventListener("securitypolicyviolation", (e) => {
        // zod 4 probes once whether eval works (Function("") in a try/catch) and falls back to its
        // plain path when it doesn't. That probe is the only eval allowed through, and only from
        // droplr's own bundle: anything else using eval is a real failure.
        if (e.blockedURI === "eval" && e.sourceFile.includes("/_next/static/") && e.sample === "") return;
        (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}`);
      });
    });

    // Every host each page actually reached, so the checks below can prove the pixels and players
    // really loaded: a policy that silently stopped them all would otherwise pass.
    const reached = new Map<string, Set<string>>();
    const visit = async (path: string, extra?: (p: Page) => Promise<void>) => {
      const page = await ctx.newPage();
      const consoleCsp: string[] = [];
      const hosts = new Set<string>();
      reached.set(path, hosts);
      page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch {} });
      page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) consoleCsp.push(m.text().slice(0, 200)); });
      const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45_000 }).catch(() => null);
      if (extra) await extra(page).catch((e) => consoleCsp.push(`interaction failed: ${e instanceof Error ? e.message.slice(0, 120) : e}`));
      await page.waitForTimeout(1500);
      const v = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp).catch(() => ["page gone"]);
      const all = [...new Set([...v, ...consoleCsp])];
      check(`${path.replace(tag, "<org>").replace(tag, "<t>")} loads with no CSP violation`, !!res && res.status() < 400 && all.length === 0, `${res?.status()} ${all.join(" | ")}`);
      await page.close();
    };

    console.log("\nPublic pages, all three pixels on");
    await visit(`/${tag}/${presave.slug}`);
    await visit(`/${tag}/${smart.slug}`);
    await visit(`/${tag}/${gate.slug}`);
    await visit(`/b/${tag}`, async (p) => { await p.locator("button[aria-label^='Play']").first().click({ timeout: 5000 }); await p.waitForTimeout(3000); });
    await visit(`/report/${report}`);
    const pre = reached.get(`/${tag}/${presave.slug}`) ?? new Set();
    check("the Meta, TikTok and GA4 scripts really loaded (control)", pre.has("connect.facebook.net") && pre.has("analytics.tiktok.com") && pre.has("www.googletagmanager.com"), [...pre].join(","));
    check("the pixels reached their collection hosts", [...pre].some((h) => h.endsWith("facebook.com")) && [...pre].some((h) => h.includes("google-analytics.com") || h.includes("analytics.google.com")), [...pre].join(","));
    check("pressing play on a bio video loaded the player (control)", (reached.get(`/b/${tag}`) ?? new Set()).has("www.youtube-nocookie.com"), [...(reached.get(`/b/${tag}`) ?? [])].join(","));

    // A form submit that redirects off-site: the pre-save buttons are exactly this, and the
    // browser applies form-action to the redirect. Pressing it must leave the page.
    {
      const page = await ctx.newPage();
      await page.goto(`${BASE}/${tag}/${smart.slug}`, { waitUntil: "domcontentloaded" });
      const target = `/api/r/${smart.id}/spotify`;
      await page.evaluate(`(() => { const f = document.createElement("form"); f.method = "post"; f.action = ${JSON.stringify(target)}; document.body.appendChild(f); f.submit(); })()`);
      await page.waitForTimeout(4000);
      const where = await page.evaluate(() => location.host).catch(() => "");
      const v = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []).catch(() => []);
      check("a form submit that redirects to a store leaves the page (control for form-action)", where === "open.spotify.com" && !v.some((x) => x.startsWith("form-action")), `${where} ${v.join(" | ")}`);
      await page.close();
    }

    console.log("\nSite pages");
    for (const p of ["/", "/pricing", "/blog", "/tools/release-plan", "/b", "/demo/demo-track", "/login", "/signup", "/legal/privacy"]) await visit(p);
    await visit(`/blog/${POSTS[0].slug}`, async (p) => { await p.locator("button[aria-label*='Play' i], button:has-text('Play'), [data-play]").first().click({ timeout: 5000 }); await p.waitForTimeout(3000); });
    check("pressing play on a blog post loaded the player (control)", (reached.get(`/blog/${POSTS[0].slug}`) ?? new Set()).has("www.youtube-nocookie.com"));

    console.log("\nDashboard");
    for (const p of ["/admin", `/admin/releases/${smart.id}`, `/admin/releases/${smart.id}?tab=look`, "/admin/downloads", "/admin/fans", "/admin/bio", `/admin/bio/${bio.id}`, "/admin/settings", "/admin/settings/integrations", "/admin/learn"]) await visit(p);

    console.log("\nThe policy is really there");
    const head = await fetch(`${BASE}/${tag}/${presave.slug}`);
    const policy = head.headers.get("content-security-policy") ?? "";
    check("public pages send the policy", /script-src/.test(policy) && /frame-ancestors 'none'/.test(policy), policy.slice(0, 80));
    const adminHead = await fetch(`${BASE}/login`);
    check("sign-in pages get the full policy, not just frame-ancestors", /script-src/.test(adminHead.headers.get("content-security-policy") ?? ""));
    const coverHead = await fetch(`${BASE}/api/cover/csp-${tag}.jpg`);
    const coverPolicy = coverHead.headers.get("content-security-policy") ?? "";
    check("stored images keep their own sandbox policy", coverPolicy.includes("sandbox") && !coverPolicy.includes("script-src"), coverPolicy);
    // Control: a script from a host the policy doesn't list must be refused, or every check above is vacuous.
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${tag}/${presave.slug}`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => { const s = document.createElement("script"); s.src = "https://evil.example/x.js"; document.head.appendChild(s); });
    await page.waitForTimeout(1000);
    const blocked = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    check("a script from an unlisted host is blocked (control)", blocked.some((b) => b.includes("evil.example")), blocked.join(" | "));
    await page.close();
  } finally {
    await browser.close();
    await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    await prisma.$disconnect();
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
