/**
 * Beta features: Agreements and Royalties are merged but off for every account until the platform
 * owner switches them on for that account.
 *
 * What these defend:
 *  - off means the feature doesn't exist for the account: no nav, no links, pages and routes 404,
 *    no reminders, and the confirmation links it emailed stop working;
 *  - off never deletes anything, and the account's CSV exports still download;
 *  - only the platform owner can flip a switch, and flipping one never touches another or the plan.
 *
 * Needs the app running (npx next start -p 3000) against the LOCAL database, with
 * PLATFORM_ADMIN_EMAILS on the server including PLATFORM_TEST_ADMIN. Never Neon.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/crypto";
import { notifyAgreementNotices } from "../src/lib/agreement-reminders";
import { setTaskMailerForTests } from "../src/lib/promo-reminders";
import { setPushSenderForTests } from "../src/lib/push";
import { tokenHash } from "../src/lib/royalties-server";
import { BETA_FEATURES } from "../src/lib/beta";
import { zonedDay, zonedLocalToDate } from "../src/lib/time";

for (const name of ["NETLIFY_DATABASE_URL", "DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  if (/neon\.tech|neon\.build/i.test(process.env[name] ?? "")) { console.error(`Refusing to run: ${name} points at Neon.`); process.exit(1); }
}

const BASE = (process.env.TEST_BASE || "http://localhost:3000").replace(/\/$/, "");
const ADMIN = (process.env.PLATFORM_TEST_ADMIN ?? "").trim().toLowerCase();
const RUN = randomBytes(3).toString("hex");
const TZ = "Australia/Brisbane";
let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
}
const session = (u: { id: string; organizationId: string; role: string }) => signToken({ sub: u.id, org: u.organizationId, role: u.role, jti: crypto.randomUUID() }, "1h", "session");
async function call(path: string, opts: { method?: string; body?: unknown; as?: string } = {}) {
  const res = await fetch(`${BASE}${path}`, { method: opts.method ?? "POST", redirect: "manual", headers: { "Content-Type": "application/json", Origin: BASE, ...(opts.as ? { Cookie: `dfm_session=${opts.as}` } : {}) }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  return { status: res.status, text: await res.text() };
}
const page = async (path: string, as: string) => { const r = await fetch(`${BASE}${path}`, { headers: { Cookie: `dfm_session=${as}` }, redirect: "manual" }); return { status: r.status, text: (await r.text()).replace(/<!-- -->/g, "") }; };

async function main() {
  if (!ADMIN) { console.error("Set PLATFORM_TEST_ADMIN to an address in the server's PLATFORM_ADMIN_EMAILS."); process.exit(1); }
  if (await prisma.user.findUnique({ where: { email: ADMIN } })) { console.error(`A user with ${ADMIN} already exists locally; test:security relies on it not existing. Delete it first.`); process.exit(1); }
  let pushes: string[] = [];
  setPushSenderForTests(async (_s, payload) => { pushes.push(payload); return true; });
  setTaskMailerForTests(async () => {});

  const org = await prisma.organization.create({ data: { name: `Beta ${RUN}`, slug: `beta-${RUN}`, plan: "label", timezone: TZ } });
  const adminOrg = await prisma.organization.create({ data: { name: `Owner ${RUN}`, slug: `beta-owner-${RUN}`, plan: "label" } });
  try {
    const owner = await prisma.user.create({ data: { email: `beta-${RUN}@example.com`, passwordHash: "x", role: "owner", organizationId: org.id, emailVerifiedAt: new Date() } });
    const admin = await prisma.user.create({ data: { email: ADMIN, passwordHash: "x", role: "owner", organizationId: adminOrg.id, emailVerifiedAt: new Date() } });
    const sOwner = await session(owner), sAdmin = await session(admin);
    const rel = await prisma.release.create({ data: { organizationId: org.id, slug: `beta-rel-${RUN}`, title: `Beta track ${RUN}`, artistName: "A", coverUrl: "https://example.com/c.jpg", releaseDate: new Date() } });
    // Made as if while the switch was on: an agreement due its notice today, a sheet with a live link, a statement.
    const today = zonedDay(new Date(), TZ);
    const ag = await prisma.agreement.create({ data: { organizationId: org.id, title: `Beta deal ${RUN}`, status: "signed", endsOn: new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000) } });
    await prisma.pushSubscription.create({ data: { userId: owner.id, endpoint: `https://push.example/beta-${RUN}`, p256dh: "k", auth: "a" } });
    const token = randomBytes(24).toString("base64url");
    await prisma.splitSheet.create({ data: { releaseId: rel.id, organizationId: org.id, parties: { create: [{ name: "Collab", email: `c-${RUN}@example.com`, shareBps: 10000, tokenHash: tokenHash(token), tokenExpiresAt: new Date(Date.now() + 86_400_000), sentVersion: 1 }] } } });
    const imp = await prisma.statementImport.create({ data: { organizationId: org.id, title: `Beta statement ${RUN}`, currency: "AUD", rowsTotal: 1, rowsMatched: 1, matchedMicros: 1n, unmatchedMicros: 0n, unmatched: [] } });

    console.log("\n1. Off by default: the features don't exist for the account");
    check("a new account has no betas", (await prisma.organization.findUnique({ where: { id: org.id } }))!.betaFeatures.length === 0);
    const home = await page("/admin", sOwner);
    check("the nav doesn't offer them", home.status === 200 && !home.text.includes('href="/admin/agreements"') && !home.text.includes('href="/admin/royalties"'));
    check("nor does Settings", !(await page("/admin/settings", sOwner)).text.includes("/admin/agreements") );
    check("the agreements pages 404", (await page("/admin/agreements", sOwner)).status === 404 && (await page(`/admin/agreements/${ag.id}`, sOwner)).status === 404 && (await page("/admin/agreements/new", sOwner)).status === 404);
    check("the royalties pages 404", (await page("/admin/royalties", sOwner)).status === 404 && (await page(`/admin/royalties/${imp.id}`, sOwner)).status === 404);
    check("the release has no Splits tab", !(await page(`/admin/releases/${rel.id}`, sOwner)).text.includes("tab=splits"));
    check("and no agreements card in Settings", !(await page(`/admin/releases/${rel.id}?tab=settings`, sOwner)).text.includes(`Beta deal ${RUN}`));
    check("creating an agreement 404s", (await call("/api/admin/agreements", { body: { title: "x" }, as: sOwner })).status === 404);
    check("editing one 404s, and changes nothing", (await call(`/api/admin/agreements/${ag.id}`, { method: "PATCH", body: { title: "changed" }, as: sOwner })).status === 404 && (await prisma.agreement.findUnique({ where: { id: ag.id } }))?.title === `Beta deal ${RUN}`);
    check("the split routes 404", (await call(`/api/admin/releases/${rel.id}/splits`, { method: "PUT", body: { parties: [] }, as: sOwner })).status === 404 && (await call(`/api/admin/releases/${rel.id}/splits/send`, { as: sOwner })).status === 404);
    check("the statement routes 404", (await call("/api/admin/royalties", { body: {}, as: sOwner })).status === 404 && (await call(`/api/admin/royalties/${imp.id}/calculate`, { as: sOwner })).status === 404 && (await call(`/api/admin/royalties/${imp.id}`, { method: "DELETE", as: sOwner })).status === 404);
    check("a confirmation link it emailed stops working", !(await page(`/split/${token}`, sOwner)).text.includes(`Beta track ${RUN}`) && (await call(`/api/split/${token}`, { body: { action: "confirm", version: 1 } })).status === 404);
    pushes = [];
    await notifyAgreementNotices(zonedLocalToDate(`${today}T12:00`, TZ), true);
    check("no notice reminder goes out", !(await prisma.agreement.findUnique({ where: { id: ag.id } }))?.noticeRemindedAt && !pushes.some((p) => p.includes(RUN)));
    check("nothing was deleted", !!(await prisma.agreement.findUnique({ where: { id: ag.id } })) && !!(await prisma.splitSheet.findUnique({ where: { releaseId: rel.id } })) && !!(await prisma.statementImport.findUnique({ where: { id: imp.id } })));
    const agCsv = await fetch(`${BASE}/api/admin/agreements/export`, { headers: { Cookie: `dfm_session=${sOwner}` } });
    const stCsv = await fetch(`${BASE}/api/admin/royalties/${imp.id}/export`, { headers: { Cookie: `dfm_session=${sOwner}` } });
    check("the CSV exports still download", agCsv.status === 200 && (await agCsv.text()).includes(`Beta deal ${RUN}`) && stCsv.status === 200);

    console.log("\n2. The switch");
    check("an account owner can't flip it", (await call(`/api/platform/orgs/${org.id}/features`, { body: { feature: "agreements", on: true }, as: sOwner })).status === 404);
    check("logged out can't", (await call(`/api/platform/orgs/${org.id}/features`, { body: { feature: "agreements", on: true } })).status === 404);
    check("an unknown feature is refused", (await call(`/api/platform/orgs/${org.id}/features`, { body: { feature: "everything", on: true }, as: sAdmin })).status === 400);
    check("the console lists both switches", (await page("/platform", sAdmin)).text.includes(BETA_FEATURES[0].label) && (await page("/platform", sAdmin)).text.includes(BETA_FEATURES[1].label));
    const planBefore = (await prisma.organization.findUnique({ where: { id: org.id } }))!;
    check("the owner switches agreements on", (await call(`/api/platform/orgs/${org.id}/features`, { body: { feature: "agreements", on: true }, as: sAdmin })).status === 200);
    check("twice is still once", (await call(`/api/platform/orgs/${org.id}/features`, { body: { feature: "agreements", on: true }, as: sAdmin })).status === 200 && (await prisma.organization.findUnique({ where: { id: org.id } }))!.betaFeatures.join() === "agreements");
    const after = (await prisma.organization.findUnique({ where: { id: org.id } }))!;
    check("the switch never touches the plan", after.plan === planBefore.plan && after.planUpdatedAt?.getTime() === planBefore.planUpdatedAt?.getTime());
    check("agreements appear for the account", (await page("/admin/agreements", sOwner)).status === 200 && (await page("/admin", sOwner)).text.includes('href="/admin/agreements"'));
    check("royalties stay off", (await page("/admin/royalties", sOwner)).status === 404);
    await notifyAgreementNotices(zonedLocalToDate(`${today}T12:00`, TZ), true);
    check("and its reminders start", !!(await prisma.agreement.findUnique({ where: { id: ag.id } }))?.noticeRemindedAt);
    await call(`/api/platform/orgs/${org.id}/features`, { body: { feature: "royalties", on: true }, as: sAdmin });
    check("royalties on: the link works again", (await page(`/split/${token}`, sOwner)).text.includes(`Beta track ${RUN}`));
    check("both on, both kept", (await prisma.organization.findUnique({ where: { id: org.id } }))!.betaFeatures.sort().join() === "agreements,royalties");
    check("switching one off leaves the other", (await call(`/api/platform/orgs/${org.id}/features`, { body: { feature: "agreements", on: false }, as: sAdmin })).status === 200 && (await prisma.organization.findUnique({ where: { id: org.id } }))!.betaFeatures.join() === "royalties");
    check("off again: the pages 404 again", (await page("/admin/agreements", sOwner)).status === 404 && (await page("/admin/royalties", sOwner)).status === 200);
    check("an account that doesn't exist is a 404", (await call(`/api/platform/orgs/nope-${RUN}/features`, { body: { feature: "royalties", on: true }, as: sAdmin })).status === 404);
  } finally {
    await prisma.pushSubscription.deleteMany({ where: { user: { organizationId: { in: [org.id, adminOrg.id] } } } });
    await prisma.release.deleteMany({ where: { organizationId: org.id } });
    await prisma.user.deleteMany({ where: { organizationId: { in: [org.id, adminOrg.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [org.id, adminOrg.id] } } });
    setPushSenderForTests(null);
    setTaskMailerForTests(null);
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { for (const f of failures) console.log(`  ✗ ${f}`); process.exit(1); }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
