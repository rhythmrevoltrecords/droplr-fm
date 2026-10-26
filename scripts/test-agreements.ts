/**
 * Contracts: agreements kept next to the roster and releases.
 *
 * What these defend:
 *  - an agreement is the label team's alone: another label, an artist login and a logged-out
 *    visitor reach none of it, and an id from another account can't be attached to one;
 *  - the document is a link, https only, never a script or a data address;
 *  - recording one needs a plan with contracts; reading, editing and deleting never do;
 *  - the notice reminder goes once, to the label team, on the right day, and only for a signed
 *    agreement with an end date.
 *
 * Needs the app running (npx next start -p 3000) against the LOCAL database. Never Neon.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/crypto";
import { cleanDocumentUrl, dayString, noticeDay, parseAgreement, parseDay, standing } from "../src/lib/agreements";
import { notifyAgreementNotices } from "../src/lib/agreement-reminders";
import { setTaskMailerForTests } from "../src/lib/promo-reminders";
import { setPushSenderForTests } from "../src/lib/push";
import { zonedDay, zonedLocalToDate } from "../src/lib/time";

for (const name of ["NETLIFY_DATABASE_URL", "DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  if (/neon\.tech|neon\.build/i.test(process.env[name] ?? "")) {
    console.error(`Refusing to run: ${name} points at Neon.`);
    process.exit(1);
  }
}

const BASE = (process.env.TEST_BASE || "http://localhost:3000").replace(/\/$/, "");
const RUN = randomBytes(3).toString("hex");
const TZ = "Australia/Brisbane";
const DAY = 86_400_000;
let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
}

let pushes: { endpoint: string; payload: string }[] = [];
setPushSenderForTests(async (sub, payload) => { pushes.push({ endpoint: sub.endpoint, payload }); return true; });
let mails: { to: string; subject: string; text: string }[] = [];
setTaskMailerForTests(async (m) => { mails.push({ to: m.to, subject: m.subject, text: m.text }); });

const session = (u: { id: string; organizationId: string; role: string }) => signToken({ sub: u.id, org: u.organizationId, role: u.role, jti: crypto.randomUUID() }, "1h", "session");
async function call(path: string, opts: { method?: string; body?: unknown; as?: string } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/json", Origin: BASE, ...(opts.as ? { Cookie: `dfm_session=${opts.as}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
const page = async (path: string, as: string) => {
  const r = await fetch(`${BASE}${path}`, { headers: { Cookie: `dfm_session=${as}` }, redirect: "manual" });
  return { status: r.status, text: await r.text() };
};

function pureChecks() {
  console.log("\n1. Fields (pure)");
  check("a real day parses to UTC midnight", parseDay("2027-03-01")?.toString() === new Date("2027-03-01T00:00:00Z").toString());
  check("a day that doesn't exist is refused", parseDay("2027-02-30") === "bad");
  check("another format is refused", parseDay("01/03/2027") === "bad" && parseDay(20270301) === "bad");
  check("blank is no date", parseDay("") === null && parseDay(null) === null);
  check("an https link is kept", cleanDocumentUrl("https://drive.google.com/file/d/abc/view") === "https://drive.google.com/file/d/abc/view");
  check("a javascript: link is refused", cleanDocumentUrl("javascript:alert(1)") === "bad");
  check("a data: link is refused", cleanDocumentUrl("data:text/html,<script>1</script>") === "bad");
  check("plain http is refused", cleanDocumentUrl("http://drive.google.com/x") === "bad");
  check("a link carrying a password is refused", cleanDocumentUrl("https://me:secret@example.com/x") === "bad");
  check("a host with no dot is refused", cleanDocumentUrl("https://localhost/x") === "bad");
  check("a name is required", "error" in parseAgreement({ kind: "recording" }));
  check("an unknown kind is refused", "error" in parseAgreement({ title: "a", kind: "marriage" }));
  check("an end before the start is refused", "error" in parseAgreement({ title: "a", startsOn: "2027-03-01", endsOn: "2027-02-01" }));
  check("notice can't be negative", "error" in parseAgreement({ title: "a", noticeDays: -1 }));
  check("release ids must be a list of ids", "error" in parseAgreement({ title: "a", releaseIds: "abc" }));
  const ok = parseAgreement({ title: "  Single   deal ", endsOn: "2027-06-30", releaseIds: ["a", "a", "b"] });
  check("a good agreement is cleaned, duplicate releases dropped", "ok" in ok && ok.ok.title === "Single deal" && ok.ok.kind === "recording" && ok.ok.status === "draft" && ok.ok.releaseIds?.length === 2);
  const end = new Date("2027-06-30T00:00:00Z");
  check("notice defaults to 30 days before the end", dayString(noticeDay({ endsOn: end, noticeDays: null })) === "2027-05-31");
  check("a set notice period is used", dayString(noticeDay({ endsOn: end, noticeDays: 90 })) === "2027-04-01");
  check("a draft has no standing badge (stays quiet)", standing({ status: "draft", endsOn: end, noticeDays: null }, "2027-06-01") === null);
  check("inside the notice window it warns", standing({ status: "signed", endsOn: end, noticeDays: null }, "2027-06-01")?.tone === "warn");
  check("before the window it doesn't", standing({ status: "signed", endsOn: end, noticeDays: null }, "2027-05-01")?.tone === "ok");
  check("after the end it says so", standing({ status: "signed", endsOn: end, noticeDays: null }, "2027-07-01")?.tone === "muted");
}

async function main() {
  pureChecks();
  const mkOrg = (name: string, plan: string, kind = "label") => prisma.organization.create({ data: { name, slug: `ag-${name}-${RUN}`, plan, kind, timezone: TZ, betaFeatures: ["agreements"] } });
  const orgs: { id: string }[] = [];
  const pro = await mkOrg("pro", "label"); orgs.push(pro);
  const free = await mkOrg("free", "free"); orgs.push(free);
  const other = await mkOrg("other", "label"); orgs.push(other);
  const solo = await mkOrg("solo", "artist_pro", "artist"); orgs.push(solo);
  try {
    const mkUser = (org: { id: string }, role: string, tag: string) => prisma.user.create({ data: { email: `ag-${tag}-${RUN}@example.com`, passwordHash: "x", role, organizationId: org.id, emailVerifiedAt: new Date() } });
    const owner = await mkUser(pro, "owner", "owner");
    const admin = await mkUser(pro, "admin", "admin");
    const artistUser = await mkUser(pro, "artist", "artist");
    const freeOwner = await mkUser(free, "owner", "free");
    const otherOwner = await mkUser(other, "owner", "other");
    const soloOwner = await mkUser(solo, "owner", "solo");
    const profile = await prisma.artist.create({ data: { organizationId: pro.id, name: `Signed Act ${RUN}`, userId: artistUser.id } });
    const otherProfile = await prisma.artist.create({ data: { organizationId: other.id, name: `Their Act ${RUN}` } });
    const mkRel = (org: { id: string }, slug: string, extra: Record<string, unknown> = {}) =>
      prisma.release.create({ data: { organizationId: org.id, slug: `ag-${slug}-${RUN}`, title: `Covered ${slug} ${RUN}`, artistName: "Signed Act", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() + 10 * DAY), ...extra } });
    const rel1 = await mkRel(pro, "one", { artistProfileId: profile.id, artistId: artistUser.id });
    const rel2 = await mkRel(pro, "two");
    const otherRel = await mkRel(other, "theirs");
    const [sOwner, sArtist, sFree, sOther, sSolo] = await Promise.all([owner, artistUser, freeOwner, otherOwner, soloOwner].map(session));

    console.log("\n2. Who can record one");
    const body = { title: `Single deal ${RUN}`, kind: "recording", status: "signed", artistId: profile.id, counterparty: null, startsOn: "2026-01-01", endsOn: "2027-12-31", documentUrl: "https://drive.google.com/file/d/x/view", termsNote: "50/50 net", notes: `secret note ${RUN}`, releaseIds: [rel1.id] };
    check("logged out can't", (await call("/api/admin/agreements", { body })).status === 401);
    check("an artist login can't", (await call("/api/admin/agreements", { body, as: sArtist })).status === 401);
    const freeTry = await call("/api/admin/agreements", { body: { ...body, artistId: null, releaseIds: [] }, as: sFree });
    check("a free label can't, and nothing is written", freeTry.status === 402 && (await prisma.agreement.count({ where: { organizationId: free.id } })) === 0, String(freeTry.status));
    check("an artist account can't, whatever its plan", (await call("/api/admin/agreements", { body: { ...body, artistId: null, releaseIds: [] }, as: sSolo })).status === 402 && (await prisma.agreement.count({ where: { organizationId: solo.id } })) === 0);
    const foreignArtist = await call("/api/admin/agreements", { body: { ...body, artistId: otherProfile.id }, as: sOwner });
    check("another label's artist can't be attached", foreignArtist.status === 400 && (await prisma.agreement.count({ where: { organizationId: pro.id } })) === 0);
    const foreignRel = await call("/api/admin/agreements", { body: { ...body, releaseIds: [rel1.id, otherRel.id] }, as: sOwner });
    check("another label's release can't be attached", foreignRel.status === 400 && (await prisma.agreement.count({ where: { organizationId: pro.id } })) === 0);
    check("a script link is refused by the route too", (await call("/api/admin/agreements", { body: { ...body, documentUrl: "javascript:alert(1)" }, as: sOwner })).status === 400);
    const made = await call("/api/admin/agreements", { body, as: sOwner });
    const agId = made.json.id as string;
    check("the label records it", made.status === 200 && !!agId, made.text.slice(0, 120));
    const stored = await prisma.agreement.findUnique({ where: { id: agId }, include: { releases: true } });
    check("stored under the caller's account, with its release", stored?.organizationId === pro.id && stored.releases.length === 1 && stored.releases[0].releaseId === rel1.id && stored.endsOn?.toISOString() === "2027-12-31T00:00:00.000Z");

    console.log("\n3. Who can see and change it");
    check("another label can't edit it", (await call(`/api/admin/agreements/${agId}`, { method: "PATCH", body: { title: "mine" }, as: sOther })).status === 404);
    check("another label can't delete it", (await call(`/api/admin/agreements/${agId}`, { method: "DELETE", as: sOther })).status === 404 && !!(await prisma.agreement.findUnique({ where: { id: agId } })));
    check("an artist login can't edit it", (await call(`/api/admin/agreements/${agId}`, { method: "PATCH", body: { title: "mine" }, as: sArtist })).status === 401);
    check("an edit can't attach another label's release", (await call(`/api/admin/agreements/${agId}`, { method: "PATCH", body: { releaseIds: [otherRel.id] }, as: sOwner })).status === 400 && (await prisma.agreementRelease.count({ where: { agreementId: agId } })) === 1);
    check("an edit can't move the start past the stored end", (await call(`/api/admin/agreements/${agId}`, { method: "PATCH", body: { startsOn: "2028-06-01" }, as: sOwner })).status === 400);
    check("the releases it covers can be replaced", (await call(`/api/admin/agreements/${agId}`, { method: "PATCH", body: { releaseIds: [rel2.id] }, as: sOwner })).status === 200 && (await prisma.agreementRelease.findMany({ where: { agreementId: agId } })).map((r) => r.releaseId).join() === rel2.id);
    await call(`/api/admin/agreements/${agId}`, { method: "PATCH", body: { releaseIds: [rel1.id, rel2.id] }, as: sOwner });

    // The new-agreement form crashed on first open in production (a value imported across the
    // client boundary). These render it, with and without a prefill, and the edit form.
    for (const path of ["/admin/agreements/new", `/admin/agreements/new?artist=${profile.id}`, `/admin/agreements/new?release=${rel1.id}`, `/admin/agreements/${agId}`]) {
      const r = await page(path, sOwner);
      check(`${path.replace(RUN, "<run>").replace(profile.id, "<artist>").replace(rel1.id, "<release>").replace(agId, "<id>")} renders its form`, r.status === 200 && r.text.includes('id="ag-title"') && !r.text.includes("couldn't load") && !r.text.includes("couldn&#x27;t load"), String(r.status));
    }
    const list = await page("/admin/agreements", sOwner);
    check("the list shows it", list.status === 200 && list.text.includes(`Single deal ${RUN}`));
    check("another label's list doesn't", !(await page("/admin/agreements", sOther)).text.includes(`Single deal ${RUN}`));
    check("another label gets a 404 on its page", (await page(`/admin/agreements/${agId}`, sOther)).status === 404);
    const artistTry = await page("/admin/agreements", sArtist);
    check("an artist login is sent away from the list", artistTry.status >= 300 && artistTry.status < 400 && !artistTry.text.includes(`Single deal ${RUN}`), String(artistTry.status));
    const dash = await page("/dashboard", sArtist);
    check("the artist's dashboard carries none of it", dash.status === 200 && !dash.text.includes(`Single deal ${RUN}`) && !dash.text.includes(`secret note ${RUN}`));
    const roster = await page(`/admin/artists/${profile.id}`, sOwner);
    check("the roster page lists it", roster.text.includes("Agreements") && roster.text.includes(`Single deal ${RUN}`));
    const relPage = await page(`/admin/releases/${rel2.id}?tab=settings`, sOwner);
    check("the release's Settings tab lists it", relPage.text.includes(`Single deal ${RUN}`));
    const relOther = await page(`/admin/releases/${rel1.id}?tab=links`, sOwner);
    check("other tabs stay quiet about it", !relOther.text.includes(`Single deal ${RUN}`));

    // Downgrade: what exists stays usable.
    await prisma.organization.update({ where: { id: pro.id }, data: { plan: "free" } });
    check("after a downgrade, a new one is refused", (await call("/api/admin/agreements", { body: { ...body, releaseIds: [] }, as: sOwner })).status === 402);
    check("after a downgrade, the existing one can be edited", (await call(`/api/admin/agreements/${agId}`, { method: "PATCH", body: { termsNote: "60/40" }, as: sOwner })).status === 200);
    check("and is still listed", (await page("/admin/agreements", sOwner)).text.includes(`Single deal ${RUN}`));
    await prisma.organization.update({ where: { id: pro.id }, data: { plan: "label" } });

    console.log("\n4. Notice reminders");
    await prisma.pushSubscription.createMany({ data: [
      { userId: owner.id, endpoint: `https://push.example/ag-owner-${RUN}`, p256dh: "k", auth: "a" },
      { userId: admin.id, endpoint: `https://push.example/ag-admin-${RUN}`, p256dh: "k", auth: "a" },
      { userId: artistUser.id, endpoint: `https://push.example/ag-artist-${RUN}`, p256dh: "k", auth: "a" },
    ] });
    const today = zonedDay(new Date(), TZ);
    // Notices land from 9am local, so the job runs at a fixed local noon (and once at 8am), not at whatever the clock says.
    const NOON = zonedLocalToDate(`${today}T12:00`, TZ);
    const EIGHT = zonedLocalToDate(`${today}T08:00`, TZ);
    const plusDays = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * DAY);
    const mk = (title: string, data: Record<string, unknown>) => prisma.agreement.create({ data: { organizationId: pro.id, title: `${title} ${RUN}`, status: "signed", ...data } });
    const dueToday = await mk("Due today", { endsOn: plusDays(30) });
    const dueSet = await mk("Ninety notice", { endsOn: plusDays(90), noticeDays: 90 });
    const notYet = await mk("Not yet", { endsOn: plusDays(31) });
    const draft = await mk("Draft", { endsOn: plusDays(30), status: "draft" });
    const ended = await mk("Ended", { endsOn: plusDays(-3) });
    const noEnd = await mk("No end", {});
    const otherDue = await prisma.agreement.create({ data: { organizationId: other.id, title: `Other due ${RUN}`, status: "signed", endsOn: plusDays(30) } });
    const mine = () => pushes.filter((p) => p.endpoint.endsWith(RUN));
    const claimed = async (id: string) => !!(await prisma.agreement.findUnique({ where: { id } }))?.noticeRemindedAt;

    pushes = []; mails = [];
    await notifyAgreementNotices(EIGHT, true);
    check("at 8am on the notice day nothing goes yet", !(await claimed(dueToday.id)) && !mine().some((p) => p.payload.includes(RUN)));
    // Nobody who could receive it: the other label has no push subscription and has switched email off.
    await prisma.user.update({ where: { id: otherOwner.id }, data: { taskEmails: false } });
    await notifyAgreementNotices(NOON, true);
    check("with nobody able to receive it, nothing is claimed", !(await claimed(otherDue.id)));
    await prisma.user.update({ where: { id: otherOwner.id }, data: { taskEmails: true } });
    await prisma.agreement.updateMany({ where: { organizationId: pro.id }, data: { noticeRemindedAt: null } });
    pushes = []; mails = [];
    await notifyAgreementNotices(NOON, true);
    check("a signed agreement 30 days from its end is reminded", await claimed(dueToday.id));
    check("a set notice period is honoured", await claimed(dueSet.id));
    check("one a day short of its window isn't", !(await claimed(notYet.id)));
    check("a draft never is", !(await claimed(draft.id)));
    check("one that has ended isn't", !(await claimed(ended.id)));
    check("one with no end date isn't", !(await claimed(noEnd.id)));
    check("owner and admin both get the push", mine().some((p) => p.endpoint.includes("ag-owner-") && p.payload.includes(`Due today ${RUN}`)) && mine().some((p) => p.endpoint.includes("ag-admin-") && p.payload.includes(`Due today ${RUN}`)));
    check("the artist login never does", !mine().some((p) => p.endpoint.includes("ag-artist-")));
    check("owner and admin get the email", mails.filter((m) => m.subject.includes(`Due today ${RUN}`)).map((m) => m.to).sort().join() === [owner.email, admin.email].sort().join(), mails.map((m) => m.to).join(","));
    check("the email says it comes from the dates, not the document", mails.some((m) => m.text.includes("not from the document")));
    check("the other label's own notice went to the other label only", await claimed(otherDue.id) && !mine().some((p) => p.payload.includes(`Other due ${RUN}`)));

    pushes = []; mails = [];
    await notifyAgreementNotices(NOON, true);
    check("a second run sends nothing", !mine().some((p) => p.payload.includes(RUN)) && !mails.some((m) => m.subject.includes(RUN)));

    check("typing the default notice into a blank field isn't a new reminder", (await call(`/api/admin/agreements/${dueToday.id}`, { method: "PATCH", body: { noticeDays: 30 }, as: sOwner })).status === 200 && await claimed(dueToday.id));
    check("flipping the status and back isn't either", (await call(`/api/admin/agreements/${dueToday.id}`, { method: "PATCH", body: { status: "ended" }, as: sOwner })).status === 200 && (await call(`/api/admin/agreements/${dueToday.id}`, { method: "PATCH", body: { status: "signed" }, as: sOwner })).status === 200 && await claimed(dueToday.id));
    check("changing the end date makes it a new reminder", (await call(`/api/admin/agreements/${dueToday.id}`, { method: "PATCH", body: { endsOn: dayString(plusDays(29)) }, as: sOwner })).status === 200 && !(await claimed(dueToday.id)));
    await prisma.user.update({ where: { id: admin.id }, data: { taskEmails: false } });
    pushes = []; mails = [];
    await notifyAgreementNotices(NOON, true, Date.now() - 1);
    check("past the deadline nothing is claimed", !(await claimed(dueToday.id)));
    await notifyAgreementNotices(NOON, true);
    await prisma.user.update({ where: { id: owner.id }, data: { pushPrefs: { agreements: false } } });
    await call(`/api/admin/agreements/${dueToday.id}`, { method: "PATCH", body: { endsOn: dayString(plusDays(30)) }, as: sOwner });
    pushes = []; mails = [];
    await notifyAgreementNotices(NOON, true);
    check("an owner who turned off agreement pushes gets the email only", !mine().some((p) => p.endpoint.includes("ag-owner-")) && mails.some((m) => m.to === owner.email));
    check("agreement pushes have their own setting, not the promo plan's", mine().some((p) => p.endpoint.includes("ag-admin-")));
    await prisma.user.update({ where: { id: owner.id }, data: { pushPrefs: {} } });
    check("with email off, the admin gets the push but no email", mine().some((p) => p.endpoint.includes("ag-admin-") && p.payload.includes(`Due today ${RUN}`)) && !mails.some((m) => m.to === admin.email), mails.map((m) => m.to).join(","));

    console.log("\n5. Leaving, exporting, odd input");
    await prisma.agreement.update({ where: { id: dueSet.id }, data: { notes: "=HYPERLINK(\"https://evil.example\")" } });
    const csv = await fetch(`${BASE}/api/admin/agreements/export`, { headers: { Cookie: `dfm_session=${sOwner}` } });
    const csvText = await csv.text();
    check("the CSV downloads, private and uncached", csv.status === 200 && (csv.headers.get("cache-control") ?? "").includes("no-store") && csvText.includes(`Single deal ${RUN}`));
    check("a formula in a note can't run in a spreadsheet", csvText.includes("'=HYPERLINK") && !/(^|,)=HYPERLINK/m.test(csvText));
    check("the CSV holds none of another label's", !csvText.includes(`Other due ${RUN}`));
    check("an artist login can't download it", (await fetch(`${BASE}/api/admin/agreements/export`, { headers: { Cookie: `dfm_session=${sArtist}` } })).status === 401);
    await prisma.organization.update({ where: { id: pro.id }, data: { plan: "free" } });
    check("it downloads on Free too", (await fetch(`${BASE}/api/admin/agreements/export`, { headers: { Cookie: `dfm_session=${sOwner}` } })).status === 200);
    await prisma.organization.update({ where: { id: pro.id }, data: { plan: "label" } });
    const close = await page("/admin/settings/account/close", sOwner);
    check("the close page says agreements go, and links the CSV", close.text.includes("agreement record") && close.text.includes("/api/admin/agreements/export"));
    check("a repeated ?artist= doesn't break the list", (await page(`/admin/agreements?artist=a&artist=b`, sOwner)).status === 200);
    const gate = await mkRel(pro, "gate", { kind: "download", title: `Gate only ${RUN}`, downloadUrl: "https://example.com/f.zip" });
    check("download gates aren't offered as releases an agreement covers", !(await page("/admin/agreements/new", sOwner)).text.includes(`Gate only ${RUN}`));
    check("and the API refuses one too", (await call("/api/admin/agreements", { body: { title: "gate deal", releaseIds: [gate.id] }, as: sOwner })).status === 400);

    // An artist's login and everything else gone: deleting the release drops the link, not the agreement.
    await prisma.release.delete({ where: { id: rel2.id } });
    check("deleting a release keeps the agreement and drops the link", !!(await prisma.agreement.findUnique({ where: { id: agId } })) && (await prisma.agreementRelease.count({ where: { agreementId: agId } })) === 1);
    check("the label deletes its record", (await call(`/api/admin/agreements/${agId}`, { method: "DELETE", as: sOwner })).status === 200 && !(await prisma.agreement.findUnique({ where: { id: agId } })));
  } finally {
    const ids = orgs.map((o) => o.id);
    await prisma.pushSubscription.deleteMany({ where: { user: { organizationId: { in: ids } } } });
    await prisma.release.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.agreement.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.artist.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.organization.deleteMany({ where: { id: { in: ids } } });
    setPushSenderForTests(null);
    setTaskMailerForTests(null);
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
