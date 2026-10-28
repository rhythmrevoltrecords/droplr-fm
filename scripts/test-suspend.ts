/**
 * Account standing (lib/account-standing): suspending from /platform, and "no music, no index".
 *
 * What these defend:
 *  - only the platform owner can suspend, and droplr's own / an admin's / a paying account can't be;
 *  - a suspended account's pages, link redirects, short links, gates, pre-saves, subscribe box and
 *    sitemap entries all answer like an unknown address, and its logins are signed out;
 *  - the login form says "suspended" only after the right password, so it can't confirm an address;
 *  - lifting it brings every page back, and nothing was deleted in between;
 *  - an account with no public release: its bio and label pages still load but carry noindex and stay
 *    out of the bio sitemap; one public release lifts that.
 *
 * Needs the app running (npx next start -p 3000) against the LOCAL database, with
 * PLATFORM_ADMIN_EMAILS on the server including PLATFORM_TEST_ADMIN. Never Neon.
 */
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/crypto";
import { suspendBlocker } from "../src/lib/account-standing";
import { bioAddress, releaseAddress } from "../src/lib/indexnow-server";
import { findDueNewsEmails } from "../src/lib/news";

for (const name of ["NETLIFY_DATABASE_URL", "DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  if (/neon\.tech|neon\.build/i.test(process.env[name] ?? "")) { console.error(`Refusing to run: ${name} points at Neon.`); process.exit(1); }
}

const BASE = (process.env.TEST_BASE || "http://localhost:3000").replace(/\/$/, "");
const ADMIN = (process.env.PLATFORM_TEST_ADMIN ?? "").trim().toLowerCase();
const RUN = randomBytes(3).toString("hex");
const PW = `Suspend-test-${RUN}-pw`;
let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
}
const session = (u: { id: string; organizationId: string; role: string }) => signToken({ sub: u.id, org: u.organizationId, role: u.role, jti: crypto.randomUUID() }, "1h", "session");
async function get(path: string, as?: string) {
  const r = await fetch(`${BASE}${path}`, { redirect: "manual", headers: as ? { Cookie: `dfm_session=${as}` } : {} });
  return { status: r.status, location: r.headers.get("location") ?? "", text: (await r.text()).replace(/<!-- -->/g, "") };
}
async function post(path: string, body: unknown, as?: string) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/json", Origin: BASE, ...(as ? { Cookie: `dfm_session=${as}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
}
async function form(path: string, fields: Record<string, string>) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", redirect: "manual", headers: { Origin: BASE }, body: new URLSearchParams(fields) });
  return { status: r.status, location: r.headers.get("location") ?? "" };
}
const noindex = (html: string) => /<meta name="robots" content="noindex/.test(html);

async function main() {
  if (!ADMIN) { console.error("Set PLATFORM_TEST_ADMIN to an address in the server's PLATFORM_ADMIN_EMAILS."); process.exit(1); }
  if (await prisma.user.findUnique({ where: { email: ADMIN } })) { console.error(`A user with ${ADMIN} already exists locally; test:security relies on it not existing. Delete it first.`); process.exit(1); }

  const hash = await bcrypt.hash(PW, 10);
  // A label with music, and an account with none (the shape of the 27 Oct sign-ups).
  const music = await prisma.organization.create({ data: { name: `Susp label ${RUN}`, slug: `susp-label-${RUN}`, plan: "label" } });
  const empty = await prisma.organization.create({ data: { name: `Susp empty ${RUN}`, slug: `susp-empty-${RUN}`, kind: "artist" } });
  const adminOrg = await prisma.organization.create({ data: { name: `Susp owner ${RUN}`, slug: `susp-owner-${RUN}`, plan: "label" } });
  const paying = await prisma.organization.create({ data: { name: `Susp paying ${RUN}`, slug: `susp-paying-${RUN}`, stripeSubscriptionId: `sub_susp_${RUN}` } });
  try {
    const owner = await prisma.user.create({ data: { email: `susp-${RUN}@example.com`, passwordHash: hash, role: "owner", organizationId: music.id, emailVerifiedAt: new Date() } });
    const emptyOwner = await prisma.user.create({ data: { email: `susp-empty-${RUN}@example.com`, passwordHash: hash, role: "owner", organizationId: empty.id, emailVerifiedAt: new Date() } });
    const admin = await prisma.user.create({ data: { email: ADMIN, passwordHash: "x", role: "owner", organizationId: adminOrg.id, emailVerifiedAt: new Date() } });
    const sOwner = await session(owner), sEmpty = await session(emptyOwner), sAdmin = await session(admin);

    const rel = await prisma.release.create({ data: { organizationId: music.id, slug: `susp-rel-${RUN}`, title: `Susp track ${RUN}`, artistName: "A", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() - 86_400_000), status: "live" } });
    const gate = await prisma.release.create({ data: { organizationId: music.id, kind: "download", slug: `susp-gate-${RUN}`, title: `Susp gate ${RUN}`, artistName: "A", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(), downloadUrl: "https://example.com/file.zip" } });
    const bio = await prisma.bioPage.create({ data: { organizationId: music.id, slug: `susp-bio-${RUN}`, title: `Susp bio ${RUN}`, imageUrl: "https://example.com/b.jpg" } });
    const link = await prisma.bioLink.create({ data: { bioPageId: bio.id, platform: "website", label: "Shop", url: "https://example.com/shop" } });
    const store = await prisma.releaseLink.create({ data: { releaseId: rel.id, platform: "custom", url: "https://example.com/store", position: 0 } });
    const visit = await prisma.gateStep.create({ data: { releaseId: gate.id, platform: "link", action: "visit", target: "https://example.com/visit" } });
    const news = await prisma.newsEmail.create({ data: { organizationId: music.id, subject: `Susp news ${RUN}`, body: "x", status: "scheduled" } });
    const emptyBio = await prisma.bioPage.create({ data: { organizationId: empty.id, slug: `susp-ebio-${RUN}`, title: `Susp ebio ${RUN}`, bio: "A trusted online investment platform", imageUrl: "https://example.com/b.jpg" } });
    await prisma.bioLink.create({ data: { bioPageId: emptyBio.id, platform: "website", label: "Invest", url: "https://example.com/invest" } });

    console.log("\n1. No music, no index");
    const eb = await get(`/b/${emptyBio.slug}`);
    check("a bio page with no release on the account still loads", eb.status === 200 && eb.text.includes(`Susp ebio ${RUN}`), String(eb.status));
    check("but carries noindex", noindex(eb.text));
    const eo = await get(`/${empty.slug}`);
    check("its label page loads with noindex too", eo.status === 200 && noindex(eo.text), String(eo.status));
    const mb = await get(`/b/${bio.slug}`);
    check("an account with a public release keeps its bio page indexable", mb.status === 200 && !noindex(mb.text), String(mb.status));
    check("and its label page", !noindex((await get(`/${music.slug}`)).text));
    let sm = (await get("/sitemap-bio.xml")).text;
    check("the bio sitemap lists the page with music and not the one without", sm.includes(bio.slug) && !sm.includes(emptyBio.slug));
    check("IndexNow is never told about the page without music", (await bioAddress(emptyBio.id)) === null && (await bioAddress(bio.id)) !== null);
    await prisma.release.create({ data: { organizationId: empty.id, slug: `susp-erel-${RUN}`, title: "First", artistName: "E", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() + 7 * 86_400_000) } });
    check("one public release (even upcoming) lifts it", !noindex((await get(`/b/${emptyBio.slug}`)).text) && (await get("/sitemap-bio.xml")).text.includes(emptyBio.slug));
    await prisma.release.deleteMany({ where: { organizationId: empty.id } });

    console.log("\n2. Who can suspend what");
    check("an account owner can't (404)", (await post(`/api/platform/orgs/${empty.id}/suspend`, { suspended: true }, sOwner)).status === 404);
    check("signed out can't", [401, 404, 307, 308].includes((await post(`/api/platform/orgs/${empty.id}/suspend`, { suspended: true })).status));
    check("not an account a platform admin logs in to", (await post(`/api/platform/orgs/${adminOrg.id}/suspend`, { suspended: true }, sAdmin)).status === 409);
    check("not one paying through Stripe", (await post(`/api/platform/orgs/${paying.id}/suspend`, { suspended: true }, sAdmin)).status === 409);
    check("not droplr's own (rule)", suspendBlocker({ slug: "rhythm-revolt-records", stripeSubscriptionId: null }, { internalSlugs: ["rhythm-revolt-records"], hasPlatformAdmin: false }) !== null);
    check("a bad body is refused", (await post(`/api/platform/orgs/${music.id}/suspend`, { suspended: "yes" }, sAdmin)).status === 400);
    const none = await prisma.organization.findMany({ where: { id: { in: [adminOrg.id, paying.id, empty.id] } }, select: { suspendedAt: true } });
    check("and none of those changed anything", none.every((o) => !o.suspendedAt));

    // Every surface below, working before: so a 404 later is the suspension and not something else.
    const live = {
      storeButton: (await get(`/api/r/${rel.id}/custom?l=${store.id}`)).status,
      gateVisit: (await get(`/api/gate/visit/${visit.id}`)).status,
      shortLink: (await get(`/r/${rel.id}`)).status,
      legacy: (await get(`/${rel.slug}`)).status,
      presave: (await form("/api/presave/email", { releaseId: rel.id, email: `fan-${RUN}@example.com` })).status,
      subscribe: (await form("/api/bio/subscribe", { bioPageId: bio.id, email: `fan-${RUN}@example.com` })).status,
      news: (await findDueNewsEmails()).some((n) => n.id === news.id),
    };
    check("before: every surface answers (baseline)", live.storeButton === 302 && live.gateVisit === 302 && live.shortLink === 301 && live.legacy === 308 && live.presave === 303 && live.subscribe === 303 && live.news, JSON.stringify(live));

    console.log("\n3. Suspended");
    check("the owner console suspends it", (await post(`/api/platform/orgs/${music.id}/suspend`, { suspended: true, reason: "test reason" }, sAdmin)).status === 200);
    check("pressing it again keeps the original reason", (await post(`/api/platform/orgs/${music.id}/suspend`, { suspended: true }, sAdmin)).status === 200);
    const row = await prisma.organization.findUnique({ where: { id: music.id }, select: { suspendedAt: true, suspendedBy: true, suspendReason: true } });
    check("it records when, who and why", !!row?.suspendedAt && row.suspendedBy === ADMIN && row.suspendReason === "test reason");
    check("the bio page 404s", (await get(`/b/${bio.slug}`)).status === 404);
    check("the label page 404s", (await get(`/${music.slug}`)).status === 404);
    check("the release page 404s", (await get(`/${music.slug}/${rel.slug}`)).status === 404);
    check("its old one-part address doesn't redirect to it", (await get(`/${rel.slug}`)).status === 404);
    check("the gate page 404s", (await get(`/${music.slug}/${gate.slug}`)).status === 404);
    check("a bio link redirect 404s", (await get(`/api/b/${link.id}`)).status === 404);
    check("the /r short link 404s", (await get(`/r/${rel.id}`)).status === 404);
    check("a store button's redirect 404s", (await get(`/api/r/${rel.id}/custom?l=${store.id}`)).status === 404);
    check("a gate's visit step 404s", (await get(`/api/gate/visit/${visit.id}`)).status === 404);
    check("scheduled news waits, still scheduled", !(await findDueNewsEmails()).some((n) => n.id === news.id) && (await prisma.newsEmail.findUnique({ where: { id: news.id } }))?.status === "scheduled");
    check("the gate never hands out the file", (await get(`/api/gate/unlock/${gate.id}`)).status === 404);
    check("the email pre-save is refused", (await form("/api/presave/email", { releaseId: rel.id, email: `fan-${RUN}@example.com` })).status === 404);
    check("the subscribe box is refused", (await form("/api/bio/subscribe", { bioPageId: bio.id, email: `fan-${RUN}@example.com` })).status === 404);
    sm = (await get("/sitemap-bio.xml")).text;
    check("it leaves the bio sitemap", !sm.includes(bio.slug));
    check("IndexNow is never told about its pages", (await bioAddress(bio.id)) === null && (await releaseAddress(rel.id)) === null);
    check("and the release sitemap", !(await get("/sitemap-releases.xml")).text.includes(rel.slug));
    const dash = await get("/admin", sOwner);
    check("an existing login is signed out", dash.status >= 300 && dash.status < 400 && dash.location.includes("/login"), `${dash.status} ${dash.location}`);
    const wrong = await form("/api/auth/login", { email: owner.email, password: "wrong-password-123" });
    check("a wrong password still just says wrong password", wrong.location.includes("error=1"), wrong.location);
    const right = await form("/api/auth/login", { email: owner.email, password: PW });
    check("the right password is told it's suspended", right.location.includes("error=suspended") && !right.location.includes("/admin"), right.location);
    check("the login page explains it", (await get("/login?error=suspended")).text.includes("This account is suspended"));
    check("another account is untouched", (await get(`/b/${emptyBio.slug}`)).status === 200 && (await get("/admin", sEmpty)).status === 200);
    const console_ = await get(`/platform?q=${encodeURIComponent(music.slug)}`, sAdmin);
    check("the console shows it suspended, with the reason and a way back", console_.text.includes("Suspended") && console_.text.includes("test reason") && console_.text.includes("Lift suspension"));

    console.log("\n4. Lifted");
    check("the owner console lifts it", (await post(`/api/platform/orgs/${music.id}/suspend`, { suspended: false }, sAdmin)).status === 200);
    check("every page is back", (await get(`/b/${bio.slug}`)).status === 200 && (await get(`/${music.slug}/${rel.slug}`)).status === 200 && (await get(`/api/b/${link.id}`)).status === 302);
    check("and every link and gate", (await get(`/api/r/${rel.id}/custom?l=${store.id}`)).status === 302 && (await get(`/api/gate/visit/${visit.id}`)).status === 302 && (await get(`/r/${rel.id}`)).status === 301);
    check("and the news is due again", (await findDueNewsEmails()).some((n) => n.id === news.id));
    check("the old login works again", (await get("/admin", sOwner)).status === 200);
    check("nothing was deleted", !!(await prisma.release.findUnique({ where: { id: rel.id } })) && !!(await prisma.bioLink.findUnique({ where: { id: link.id } })) && !!(await prisma.release.findUnique({ where: { id: gate.id } })));
    check("and the record is cleared", !(await prisma.organization.findUnique({ where: { id: music.id } }))?.suspendedAt);
  } finally {
    await prisma.preSave.deleteMany({ where: { email: `fan-${RUN}@example.com` } }).catch(() => {});
    await prisma.fanContact.deleteMany({ where: { email: `fan-${RUN}@example.com` } }).catch(() => {});
    await prisma.user.deleteMany({ where: { organizationId: { in: [music.id, empty.id, adminOrg.id, paying.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [music.id, empty.id, adminOrg.id, paying.id] } } });
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { for (const f of failures) console.log(`  ✗ ${f}`); process.exit(1); }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
