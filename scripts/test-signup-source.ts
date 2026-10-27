/**
 * Where sign-ups came from (lib/signup-source, the dfm_from cookie, /platform/sources), and the
 * referrer names that fans' views and clicks are reported under (lib/referrer-source).
 *
 * What these defend:
 *  - the cookie is set only on droplr.fm's own marketing pages, only for a tagged link or an outside
 *    site, first touch only, HTTP-only, 30 days, and never on an artist's or label's page;
 *  - what the browser sends back is re-checked at sign-up, so a forged cookie stores nothing and
 *    never blocks the account;
 *  - the report counts each channel's sign-ups, confirmed emails, releases and paying accounts, and
 *    only the platform owner can open it;
 *  - "reddit.com" is Reddit, not X: host labels, not substrings. The migration's SQL copy of those
 *    rules agrees with the TypeScript, and re-running it changes nothing;
 *  - every cookie droplr sets is named in the cookie policy.
 *
 * Needs the app running (npx next start -p 3000) against the LOCAL database, with
 * PLATFORM_ADMIN_EMAILS on the server including PLATFORM_TEST_ADMIN. Never Neon.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/crypto";
import { hostOf, sourceFromHost } from "../src/lib/referrer-source";
import { captureSignupSource, cleanTag, isMarketingPath, readSignupSource, SIGNUP_SOURCE_COOKIE } from "../src/lib/signup-source";
import { signupSourcesReport, sourceLabel, UNKNOWN } from "../src/lib/signup-sources-report";
import { createInvite } from "../src/lib/signup-invites";
import { resolveSource } from "../src/lib/tracking";

for (const name of ["NETLIFY_DATABASE_URL", "DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  if (/neon\.tech|neon\.build/i.test(process.env[name] ?? "")) { console.error(`Refusing to run: ${name} points at Neon.`); process.exit(1); }
}

const BASE = (process.env.TEST_BASE || "http://localhost:3000").replace(/\/$/, "");
const ADMIN = (process.env.PLATFORM_TEST_ADMIN ?? "").trim().toLowerCase();
const RUN = randomBytes(3).toString("hex");
let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
}
const session = (u: { id: string; organizationId: string; role: string }) => signToken({ sub: u.id, org: u.organizationId, role: u.role, jti: crypto.randomUUID() }, "1h", "session");
const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

/** GET a page, returning the dfm_from Set-Cookie line (or ""). */
async function visit(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", headers });
  await res.arrayBuffer();
  const line = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${SIGNUP_SOURCE_COOKIE}=`)) ?? "";
  // `raw` is the value as sent back in a Cookie header; `value` is what the app reads (Next decodes it).
  const raw = line ? line.split(";")[0].slice(SIGNUP_SOURCE_COOKIE.length + 1) : "";
  return { status: res.status, line, raw, value: raw ? decodeURIComponent(raw) : "" };
}

async function signup(email: string, code: string, cookie?: string) {
  const form = new URLSearchParams({ orgName: `Src ${RUN} ${email.slice(0, 6)}`, email, password: `Pw-${randomBytes(12).toString("hex")}!`, terms: "yes", kind: "artist", inviteCode: code });
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST", redirect: "manual", body: form,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: BASE, "X-Forwarded-For": randomIp(), ...(cookie ? { Cookie: cookie } : {}) },
  });
  await res.arrayBuffer();
  return { status: res.status, location: res.headers.get("location") ?? "", cookies: res.headers.getSetCookie?.() ?? [] };
}

function walk(dir: string, out: string[] = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

async function main() {
  if (!ADMIN) { console.error("Set PLATFORM_TEST_ADMIN to an address in the server's PLATFORM_ADMIN_EMAILS."); process.exit(1); }
  if (await prisma.user.findUnique({ where: { email: ADMIN } })) { console.error(`A user with ${ADMIN} already exists locally; test:security relies on it not existing. Delete it first.`); process.exit(1); }

  console.log("\n1. Referrer names: whole host labels, not substrings");
  const names: [string, string][] = [
    ["reddit.com", "reddit"], ["old.reddit.com", "reddit"], ["redd.it", "reddit"], ["t.co", "x"], ["x.com", "x"], ["twitter.com", "x"],
    ["bitcoinbox.com", "bitcoinbox.com"], ["instagram.com.evil.example", "instagram.com.evil.example"], ["l.instagram.com", "instagram"],
    ["myyoutubefans.net", "myyoutubefans.net"], ["m.youtube.com", "youtube"], ["youtu.be", "youtube"], ["google.com", "google"],
    ["google.com.au", "google"], ["google.co.uk", "google"], ["lh3.googleusercontent.com", "lh3.googleusercontent.com"],
    ["docs.google.com", "docs.google.com"], ["sites.google.com", "sites.google.com"],
    ["l.facebook.com", "facebook"], ["notfacebook.com", "notfacebook.com"], ["soundcloud.com", "soundcloud"], ["news.ycombinator.com", "hacker news"],
    ["blog.example", "blog.example"],
  ];
  const wrongNames = names.filter(([h, want]) => sourceFromHost(h) !== want);
  check("every host is named as expected", !wrongNames.length, wrongNames.map(([h, w]) => `${h}→${sourceFromHost(h)} want ${w}`).join(", "));
  check("a fan arriving from Reddit is reported as Reddit, not X", resolveSource({ referrer: "https://www.reddit.com/r/UKgarage/", selfHosts: ["droplr.fm"] }) === "reddit");
  check("Android apps are named like their sites", resolveSource({ referrer: "android-app://com.instagram.android/", selfHosts: ["droplr.fm"] }) === "instagram" && resolveSource({ referrer: "android-app://com.google.android.gm/", selfHosts: ["droplr.fm"] }) === "google" && resolveSource({ referrer: "android-app://com.example.player/", selfHosts: ["droplr.fm"] }) === "com.example.player");
  check("the page's own host is still direct", resolveSource({ referrer: "https://droplr.fm/x/y", selfHosts: ["droplr.fm"] }) === "direct");
  check("a utm tag still wins over the referrer", resolveSource({ utmSource: "insta_story", referrer: "https://www.reddit.com/", selfHosts: ["droplr.fm"] }) === "insta_story");
  check("hostOf refuses anything that isn't a web address", hostOf("javascript:alert(1)") === null && hostOf("not a url") === null && hostOf("https://localhost/") === null && hostOf("https://WWW.Reddit.com:443/r") === "reddit.com");

  console.log("\n2. What the cookie records");
  check("tags are cleaned to short plain words", cleanTag("Reddit Ads!") === "reddit_ads" && cleanTag("  ") === null && cleanTag("<script>") === "script" && cleanTag("x".repeat(90))!.length === 60);
  check("marketing pages only", ["/", "/pricing", "/tools/release-plan", "/blog/x", "/signup", "/join/abc", "/learn"].every(isMarketingPath) && !["/rhythm-revolt/again", "/b/nathan-hill", "/r/abc", "/admin", "/api/r/x", "/platform", "/pricingx"].some(isMarketingPath));
  const now = new Date("2026-10-27T00:00:00Z");
  const at = (path: string, referer: string | null = null) => readSignupSource(captureSignupSource({ url: new URL(`https://droplr.fm${path}`), referer, selfHost: "droplr.fm", now }), now);
  const tagged = at("/tools/release-plan?utm_source=Reddit&utm_medium=Ad&utm_campaign=Oct+Test&email=a@b.c", "https://www.reddit.com/r/edmproduction/comments/123/?q=secret");
  check("a tagged visit keeps the tags, the referring host only, and the path without its query", tagged?.source === "reddit" && tagged.medium === "ad" && tagged.campaign === "oct_test" && tagged.referrerHost === "reddit.com" && tagged.landingPath === "/tools/release-plan" && tagged.firstSeenAt.getTime() === now.getTime(), JSON.stringify(tagged));
  const untagged = at("/", "https://www.youtube.com/watch?v=abc");
  check("an untagged visit from another site keeps just that site", untagged?.source === null && untagged.referrerHost === "youtube.com" && untagged.medium === null);
  check("medium and campaign without a source are dropped", at("/?utm_medium=ad&utm_campaign=x", "https://www.google.com/")?.medium === null);
  check("nothing for a direct visit", captureSignupSource({ url: new URL("https://droplr.fm/"), referer: null, selfHost: "droplr.fm" }) === null);
  check("nothing for moving between droplr's own pages", captureSignupSource({ url: new URL("https://droplr.fm/pricing"), referer: "https://droplr.fm/", selfHost: "droplr.fm" }) === null && captureSignupSource({ url: new URL("https://droplr.fm/pricing"), referer: "https://abc--droplr-fm.netlify.app/", selfHost: "droplr.fm" }) === null);
  check("nothing on a label's page, tagged or not", captureSignupSource({ url: new URL("https://droplr.fm/rhythm-revolt/again?utm_source=ig"), referer: "https://instagram.com/", selfHost: "droplr.fm" }) === null);
  check("a fan page on a label subdomain counts as an outside site", at("/", "https://rhythm-revolt.droplr.fm/again")?.referrerHost === "rhythm-revolt.droplr.fm");

  console.log("\n3. A cookie sent back is checked again, never trusted");
  const enc = (o: unknown) => JSON.stringify(o);
  const t = Math.floor(now.getTime() / 1000);
  check("not JSON", readSignupSource("%7Bnope", now) === null);
  check("wrong version", readSignupSource(enc({ v: 2, s: "x", l: "/", t }), now) === null);
  check("from the future", readSignupSource(enc({ v: 1, s: "x", l: "/", t: t + 3600 }), now) === null);
  check("older than the cookie can live", readSignupSource(enc({ v: 1, s: "x", l: "/", t: t - 40 * 86400 }), now) === null);
  check("a time too large to be a date", readSignupSource(enc({ v: 1, s: "x", l: "/", t: 1e300 }), now) === null);
  check("neither a source nor a host", readSignupSource(enc({ v: 1, l: "/", t }), now) === null);
  check("oversized", readSignupSource("a".repeat(1001), now) === null);
  const odd = readSignupSource(enc({ v: 1, s: "<b>Evil</b> Source", m: 5, c: "ok", r: "evil.example/path?x=1", l: "/<script>", t }), now);
  check("odd values are cleaned or dropped", odd?.source === "bevilb_source" && odd.medium === null && odd.campaign === "ok" && odd.referrerHost === null && odd.landingPath === "/", JSON.stringify(odd));

  console.log("\n4. The migration's SQL names hosts the same way");
  const sql = readFileSync("prisma/migrations/20261118000000_signup_source/migration.sql", "utf8");
  const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION pg_temp.droplr_ref_source"), sql.indexOf("$f$;") + 4);
  const updates = sql.slice(sql.indexOf("UPDATE \"PageView\"")).trim();
  check("the migration has the function and both updates", fn.length > 200 && /UPDATE "PageView"/.test(updates) && /UPDATE "ClickEvent"/.test(updates));
  const refs = [...names.map(([h]) => `https://www.${h}/path?x=1`), "https://WWW.REDDIT.COM/r/x", "https://user@old.reddit.com/", "https://localhost/", "ftp://reddit.com/", "nonsense", "https://reddit.com\\@evil.com/", "https://evil.com\\@reddit.com/", "https://reddit.com.:443/x", "http://Old.Reddit.Com/"];
  const sqlNames = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(fn);
    const out: (string | null)[] = [];
    for (const r of refs) out.push(((await tx.$queryRawUnsafe(`SELECT pg_temp.droplr_ref_source($1) AS s`, r)) as { s: string | null }[])[0].s);
    return out;
  });
  const disagree = refs.filter((r, i) => (hostOf(r) ? sourceFromHost(hostOf(r)!) : null) !== sqlNames[i]);
  check("SQL and TypeScript agree on every sample", !disagree.length, disagree.map((r) => `${r}: sql ${sqlNames[refs.indexOf(r)]} ts ${hostOf(r) ? sourceFromHost(hostOf(r)!) : null}`).join("; "));

  const org = await prisma.organization.create({ data: { name: `Src ${RUN}`, slug: `src-${RUN}` } });
  const adminOrg = await prisma.organization.create({ data: { name: `Src owner ${RUN}`, slug: `src-owner-${RUN}` } });
  const made: string[] = [org.id, adminOrg.id];
  try {
    const rel = await prisma.release.create({ data: { organizationId: org.id, slug: `src-rel-${RUN}`, title: "T", artistName: "A", coverUrl: "https://example.com/c.jpg", releaseDate: new Date() } });
    const v = await prisma.linkVariant.create({ data: { releaseId: rel.id, source: "x", slug: `v-${RUN}` } });
    const rows = await Promise.all([
      prisma.pageView.create({ data: { releaseId: rel.id, source: "x", referrer: "https://www.reddit.com/r/x" } }),
      prisma.pageView.create({ data: { releaseId: rel.id, source: "youtube", referrer: "https://myyoutubefans.net/" } }),
      prisma.pageView.create({ data: { releaseId: rel.id, source: "x", referrer: "https://www.reddit.com/", utm_source: "x" } }),
      prisma.pageView.create({ data: { releaseId: rel.id, source: "direct", referrer: "https://droplr.fm/" } }),
      prisma.pageView.create({ data: { releaseId: rel.id, source: "x", referrer: "https://t.co/abc" } }),
      prisma.clickEvent.create({ data: { releaseId: rel.id, platform: "spotify", source: "x", referrer: "https://old.reddit.com/" } }),
    ]);
    const variantRow = v ? await prisma.pageView.create({ data: { releaseId: rel.id, variantId: v.id, source: "x", referrer: "https://www.reddit.com/" } }) : null;
    const runUpdates = () => prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(fn);
      let n = 0;
      for (const stmt of updates.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) n += await tx.$executeRawUnsafe(stmt);
      return n;
    });
    await runUpdates();
    const [pv1, pv2, pv3, pv4, pv5] = await Promise.all(rows.slice(0, 5).map((r) => prisma.pageView.findUnique({ where: { id: r.id } })));
    const ce = await prisma.clickEvent.findUnique({ where: { id: rows[5].id } });
    check("a Reddit view stored as X becomes reddit", pv1?.source === "reddit");
    check("a host that merely contained youtube becomes its own name", pv2?.source === "myyoutubefans.net");
    check("a view with a utm tag is left alone", pv3?.source === "x");
    check("a direct view is left alone", pv4?.source === "direct");
    check("a real X view stays X", pv5?.source === "x");
    check("a Reddit click stored as X becomes reddit", ce?.source === "reddit");
    if (variantRow) check("a view through a campaign link is left alone", (await prisma.pageView.findUnique({ where: { id: variantRow.id } }))?.source === "x");
    check("running it again changes nothing", (await runUpdates()) === 0);

    console.log("\n5. The cookie in a real browser request");
    const first = await visit(`/?utm_source=Reddit+Ads&utm_medium=ad&utm_campaign=oct-${RUN}`);
    const firstVal = readSignupSource(first.value);
    check("a tagged landing sets it: HTTP-only, 30 days, SameSite=Lax", first.status === 200 && /httponly/i.test(first.line) && /max-age=2592000/i.test(first.line) && /samesite=lax/i.test(first.line) && firstVal?.source === "reddit_ads" && firstVal.campaign === `oct-${RUN}`, first.line);
    check("a later visit doesn't overwrite it", (await visit("/pricing?utm_source=google", { Cookie: `${SIGNUP_SOURCE_COOKIE}=${first.raw}` })).line === "");
    check("an outside referrer sets it", readSignupSource((await visit("/blog", { Referer: "https://www.youtube.com/watch?v=1" })).value)?.referrerHost === "youtube.com");
    check("a direct visit sets nothing", (await visit("/")).line === "");
    check("someone already logged in gets nothing", (await visit("/pricing?utm_source=google", { Cookie: "dfm_session=anything" })).line === "");
    check("droplr's own pages as referrer set nothing", (await visit("/pricing", { Referer: `${BASE}/` })).line === "");
    check("the free tool sets it", readSignupSource((await visit("/tools/release-plan?utm_source=hn")).value)?.landingPath === "/tools/release-plan");
    check("an artist's release page never sets it", (await visit(`/${org.slug}/${rel.slug}?utm_source=ig`, { Referer: "https://instagram.com/" })).line === "");
    check("nor a bio page or an API route", (await visit("/b/nobody?utm_source=ig")).line === "" && (await visit("/api/cover/nothing?utm_source=ig")).line === "");
    const powered = readFileSync("src/components/public/artwork-shell.tsx", "utf8").match(/href="(https:\/\/droplr\.fm[^"]*)"[^>]*>\s*<Image[^]*?Powered by droplr\.fm/);
    const poweredUrl = powered ? new URL(powered[1].replace(/&amp;/g, "&")) : null;
    check("the Powered by link on fan pages is tagged, so that loop shows up", poweredUrl?.searchParams.get("utm_source") === "powered_by" && poweredUrl.searchParams.get("utm_medium") === "fan_page", powered?.[1]);

    console.log("\n6. Sign-up copies it onto the account");
    const inv = await createInvite({ maxUses: 10, note: `src test ${RUN}` }, "test");
    if (!inv.ok) throw new Error("invite");
    const a = await signup(`src-a-${RUN}@example.com`, inv.code, `${SIGNUP_SOURCE_COOKIE}=${first.raw}`);
    const orgA = await prisma.organization.findFirst({ where: { users: { some: { email: `src-a-${RUN}@example.com` } } }, include: { signupSource: true } });
    if (orgA) made.push(orgA.id);
    check("the sign-up went through", a.status === 307 || a.status === 303 || a.status === 302, `${a.status} ${a.location}`);
    check("its source is stored", orgA?.signupSource?.source === "reddit_ads" && orgA.signupSource.medium === "ad" && orgA.signupSource.campaign === `oct-${RUN}` && orgA.signupSource.landingPath === "/", JSON.stringify(orgA?.signupSource));
    check("and the cookie is deleted", a.cookies.some((c) => c.startsWith(`${SIGNUP_SOURCE_COOKIE}=;`) || (c.startsWith(`${SIGNUP_SOURCE_COOKIE}=`) && /max-age=0|expires=thu, 01 jan 1970/i.test(c))), a.cookies.join(" | "));
    const b = await signup(`src-b-${RUN}@example.com`, inv.code);
    const orgB = await prisma.organization.findFirst({ where: { users: { some: { email: `src-b-${RUN}@example.com` } } }, include: { signupSource: true } });
    if (orgB) made.push(orgB.id);
    check("no cookie: the account is made and nothing is stored", !!orgB && orgB.signupSource === null, `${b.status}`);
    const c = await signup(`src-c-${RUN}@example.com`, inv.code, `${SIGNUP_SOURCE_COOKIE}=${encodeURIComponent(enc({ v: 1, s: "x", l: "/", t: t + 999999 }))}`);
    const orgC = await prisma.organization.findFirst({ where: { users: { some: { email: `src-c-${RUN}@example.com` } } }, include: { signupSource: true } });
    if (orgC) made.push(orgC.id);
    check("a forged cookie: the account is still made, nothing is stored", !!orgC && orgC.signupSource === null, `${c.status}`);

    console.log("\n7. The report");
    if (orgA) await prisma.release.create({ data: { organizationId: orgA.id, slug: `src-a-rel-${RUN}`, title: "A", artistName: "A", coverUrl: "https://example.com/c.jpg", releaseDate: new Date() } });
    const report = await signupSourcesReport("30");
    const row = report.rows.find((r) => r.source === "reddit_ads" && r.campaign === `oct-${RUN}`);
    check("the tagged sign-up has its own row, with its release counted", row?.signups === 1 && row.madeRelease === 1 && row.medium === "ad" && row.paying === 0, JSON.stringify(row));
    check("untagged accounts are under Direct or unknown, listed last", report.rows.at(-1)?.source === UNKNOWN && report.unknown >= 2);
    check("labels without a tag fall back to the site's name", sourceLabel({ source: null, referrerHost: "old.reddit.com" }) === "reddit" && sourceLabel(null) === UNKNOWN);
    const owner = await prisma.user.findFirstOrThrow({ where: { organizationId: orgA!.id } });
    const admin = await prisma.user.create({ data: { email: ADMIN, passwordHash: "x", role: "owner", organizationId: adminOrg.id, emailVerifiedAt: new Date() } });
    const asAdmin = await fetch(`${BASE}/platform/sources?period=30`, { headers: { Cookie: `dfm_session=${await session(admin)}` }, redirect: "manual" });
    const html = (await asAdmin.text()).replace(/<!-- -->/g, "");
    check("the platform owner sees the page with the row", asAdmin.status === 200 && html.includes("Where sign-ups came from") && html.includes(`oct-${RUN}`) && html.includes("Direct or unknown"), String(asAdmin.status));
    check("the console links to it", html.includes('href="/platform/sources"'));
    const asOwner = await fetch(`${BASE}/platform/sources`, { headers: { Cookie: `dfm_session=${await session(owner)}` }, redirect: "manual" });
    const ownerHtml = await asOwner.text();
    check("an account owner who isn't the platform owner can't", asOwner.status !== 200 || !ownerHtml.includes("Where sign-ups came from"), String(asOwner.status));
    check("logged out goes to log in", (await fetch(`${BASE}/platform/sources`, { redirect: "manual" })).status === 307);
    await prisma.user.delete({ where: { id: admin.id } });
    if (orgA) {
      await prisma.organization.delete({ where: { id: orgA.id } });
      check("closing the account deletes its source row", (await prisma.signupSource.count({ where: { organizationId: orgA.id } })) === 0);
    }

    console.log("\n8. Every cookie droplr sets is in the cookie policy");
    const policy = readFileSync("src/app/legal/cookies/page.tsx", "utf8");
    const set = new Set<string>();
    for (const f of [...walk("src"), "src/middleware.ts"]) for (const m of readFileSync(f, "utf8").matchAll(/(?:const|export const) [A-Z_]*COOKIE = "(dfm_[a-z_]+)"/g)) set.add(m[1]);
    const missing = [...set].filter((n) => !policy.includes(`<code>${n}</code>`));
    check("found the cookie names", set.has("dfm_from") && set.has("dfm_ref") && set.has("dfm_anon") && set.size >= 4, [...set].join(","));
    check("each one has a row", !missing.length, missing.join(", "));
  } finally {
    await prisma.user.deleteMany({ where: { email: ADMIN } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { OR: [{ id: { in: made } }, { name: { startsWith: `Src ${RUN}` } }] } }).catch(() => {});
    await prisma.signupInvite.deleteMany({ where: { note: `src test ${RUN}` } }).catch(() => {});
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { for (const f of failures) console.log(`  ✗ ${f}`); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
