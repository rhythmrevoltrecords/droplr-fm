/**
 * Release planning for teams: tasks, assignment, reminders and the roster calendar.
 *
 * What these defend:
 *  - only the label's own team can add, edit or assign, only on a team plan, and a downgrade never
 *    stops what was already made (or the way back to unassigned);
 *  - an artist login can tick only what was given to the artist, on its own releases;
 *  - a reminder reaches the person it was assigned to and nobody else, once, and email goes only
 *    to steps and tasks someone assigned;
 *  - two releases on the same day, or the same artist inside 14 days, are flagged — in the
 *    account's timezone, not UTC.
 *
 * Needs the app running (npx next start -p 3000) against the LOCAL database. Never Neon.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/crypto";
import { duePromoWork, notifyDuePromoSteps, setTaskMailerForTests } from "../src/lib/promo-reminders";
import { promoSteps, stepDate } from "../src/lib/promo";
import { setPushSenderForTests } from "../src/lib/push";
import { findClashes, parseTask, TASK_LIMITS } from "../src/lib/release-tasks";
import { isValidTimeZone } from "../src/lib/time";

for (const name of ["NETLIFY_DATABASE_URL", "DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  const raw = process.env[name] ?? "";
  if (/neon\.tech|neon\.build/i.test(raw)) {
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
async function call(path: string, opts: { method?: string; body?: unknown; as?: string; origin?: string } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/json", Origin: opts.origin ?? BASE, ...(opts.as ? { Cookie: `dfm_session=${opts.as}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

function pureChecks() {
  console.log("\n1. Task fields and clash rules (pure)");
  check("a task needs a name", "error" in parseTask({ day: 0 }));
  check("a blank name is refused", "error" in parseTask({ title: "   ", day: 0 }));
  check("a name over the limit is refused", "error" in parseTask({ title: "x".repeat(TASK_LIMITS.title + 1), day: 0 }));
  check("a fractional day is refused", "error" in parseTask({ title: "a", day: 1.5 }));
  check("a day past a year is refused", "error" in parseTask({ title: "a", day: 366 }));
  check("an unknown assignee is refused", "error" in parseTask({ title: "a", day: 0, assignee: "everyone" }));
  const ok = parseTask({ title: "  Master   to distributor ", day: -21 });
  check("a good task is cleaned and defaults to the label", "ok" in ok && ok.ok.title === "Master to distributor" && ok.ok.assignee === "label" && ok.ok.day === -21, JSON.stringify(ok));
  check("an edit may change one field", "ok" in parseTask({ assignee: "artist" }, true));

  const r = (id: string, artistName: string, iso: string, artistProfileId: string | null = null, kind = "release") => ({ id, title: id, artistName, artistProfileId, releaseDate: new Date(iso), kind });
  const sameDay = findClashes([r("a", "One", "2026-12-04T00:00:00Z"), r("b", "Two", "2026-12-04T09:00:00Z")], TZ);
  check("two releases the same day are both flagged", sameDay.get("a")?.[0]?.reason === "same-day" && sameDay.get("b")?.[0]?.reason === "same-day");
  const nextDay = findClashes([r("a", "One", "2026-12-04T00:00:00Z"), r("b", "Two", "2026-12-05T00:00:00Z")], TZ);
  check("different artists a day apart are not flagged (control)", nextDay.size === 0);
  // 13:30 and 15:30 UTC on the 4th are the 4th and the 5th in Brisbane (UTC+10): different days there.
  const tz = findClashes([r("a", "One", "2026-12-04T13:30:00Z"), r("b", "Two", "2026-12-04T15:30:00Z")], TZ);
  check("the day is the account's, not UTC's", tz.size === 0, JSON.stringify([...tz]));
  const tz2 = findClashes([r("a", "One", "2026-12-04T15:30:00Z"), r("b", "Two", "2026-12-05T10:00:00Z")], TZ);
  check("different UTC days, same Brisbane day, are flagged", tz2.get("a")?.[0]?.reason === "same-day");
  const artist13 = findClashes([r("a", "Same", "2026-12-01T00:00:00Z", "p1"), r("b", "Same", "2026-12-14T00:00:00Z", "p1")], TZ);
  check("the same artist 13 days apart is flagged", artist13.get("a")?.[0]?.reason === "same-artist" && artist13.get("a")?.[0]?.days === 13);
  const artist14 = findClashes([r("a", "Same", "2026-12-01T00:00:00Z", "p1"), r("b", "Same", "2026-12-15T00:00:00Z", "p1")], TZ);
  check("the same artist 14 days apart is not", artist14.size === 0);
  const byName = findClashes([r("a", "DJ  Drive", "2026-12-01T00:00:00Z"), r("b", "dj drive", "2026-12-05T00:00:00Z")], TZ);
  check("with no roster profile, the artist name matches case- and space-insensitively", byName.get("a")?.[0]?.reason === "same-artist");
  const dl = findClashes([r("a", "One", "2026-12-04T00:00:00Z"), r("b", "Two", "2026-12-04T01:00:00Z", null, "download")], TZ);
  check("a download gate never clashes", dl.size === 0);
}

async function main() {
  pureChecks();

  const mkOrg = (name: string, plan: string, kind = "label") => prisma.organization.create({ data: { name, slug: `rp-${name}-${RUN}`, plan, kind, timezone: TZ } });
  const pro = await mkOrg("pro", "label");
  const free = await mkOrg("free", "free");
  const other = await mkOrg("other", "label");
  const orgs: { id: string }[] = [pro, free, other];
  try {
    const mkUser = (org: { id: string }, role: string, tag: string) => prisma.user.create({ data: { email: `rp-${tag}-${RUN}@example.com`, passwordHash: "x", role, organizationId: org.id, emailVerifiedAt: new Date() } });
    const owner = await mkUser(pro, "owner", "owner");
    const artistUser = await mkUser(pro, "artist", "artist");
    const otherArtistUser = await mkUser(pro, "artist", "artist2");
    const freeOwner = await mkUser(free, "owner", "freeowner");
    const otherOwner = await mkUser(other, "owner", "otherowner");
    const profile = await prisma.artist.create({ data: { organizationId: pro.id, name: "Planner", userId: artistUser.id } });

    const releaseDate = new Date(Date.now() + 7 * DAY - 3 * 3600_000);
    const mkRel = (org: { id: string }, slug: string, extra: Record<string, unknown> = {}) =>
      prisma.release.create({ data: { organizationId: org.id, slug: `rp-${slug}-${RUN}`, title: `Track ${slug} ${RUN}`, artistName: "Planner", coverUrl: "https://example.com/c.jpg", releaseDate, ...extra } });
    const rel = await mkRel(pro, "main", { artistId: artistUser.id, artistProfileId: profile.id });
    const freeRel = await mkRel(free, "free");
    const otherRel = await mkRel(other, "other");
    const otherArtistRel = await mkRel(pro, "notyours", { artistId: otherArtistUser.id, releaseDate: new Date(releaseDate.getTime() + 60 * DAY) });

    const sOwner = await session(owner), sArtist = await session(artistUser), sFree = await session(freeOwner), sOther = await session(otherOwner);
    const tasksUrl = `/api/admin/releases/${rel.id}/tasks`;

    console.log("\n2. Who can add and assign");
    check("logged out can't add a task", (await call(tasksUrl, { body: { title: "x", day: 0 } })).status === 401);
    check("another label gets a 404, not a 403", (await call(tasksUrl, { body: { title: "x", day: 0 }, as: sOther })).status === 404);
    check("an artist login can't add a task", (await call(tasksUrl, { body: { title: "x", day: 0 }, as: sArtist })).status === 401);
    const freeAdd = await call(`/api/admin/releases/${freeRel.id}/tasks`, { body: { title: "x", day: 0 }, as: sFree });
    check("a free label can't add a task, and nothing is written", freeAdd.status === 402 && (await prisma.releaseTask.count({ where: { releaseId: freeRel.id } })) === 0, `${freeAdd.status}`);
    check("a free label can't assign a step, and nothing is written", (await call(`/api/admin/releases/${freeRel.id}/promo`, { body: { key: "countdown-7", assignee: "artist" }, as: sFree })).status === 402 && (await prisma.promoStepAssign.count({ where: { releaseId: freeRel.id } })) === 0);
    await prisma.promoStepAssign.create({ data: { releaseId: freeRel.id, key: "teaser", assignee: "label" } });
    check("a free label can still unassign (the way back never needs a plan)", (await call(`/api/admin/releases/${freeRel.id}/promo`, { body: { key: "teaser", assignee: null }, as: sFree })).status === 200 && (await prisma.promoStepAssign.count({ where: { releaseId: freeRel.id } })) === 0);
    check("a step that doesn't exist can't be assigned", (await call(`/api/admin/releases/${rel.id}/promo`, { body: { key: "made-up", assignee: "label" }, as: sOwner })).status === 400);
    check("a bad assignee is refused", (await call(`/api/admin/releases/${rel.id}/promo`, { body: { key: "countdown-7", assignee: "fans" }, as: sOwner })).status === 400);
    check("a bad day is refused", (await call(tasksUrl, { body: { title: "x", day: 9999 }, as: sOwner })).status === 400);

    const seven = promoSteps("label").find((s) => s.key === "countdown-7")!;
    const assignArtist = await call(`/api/admin/releases/${rel.id}/promo`, { body: { key: seven.key, assignee: "artist" }, as: sOwner });
    check("the label assigns a step to the artist", assignArtist.status === 200 && (await prisma.promoStepAssign.findFirst({ where: { releaseId: rel.id, key: seven.key } }))?.assignee === "artist", `${assignArtist.status}`);
    const labelTask = await call(tasksUrl, { body: { title: `Label job ${RUN}`, day: seven.day, assignee: "label" }, as: sOwner });
    const artistTask = await call(tasksUrl, { body: { title: `Artist job ${RUN}`, day: seven.day, assignee: "artist", note: "Bring the stems" }, as: sOwner });
    check("the label adds tasks", labelTask.status === 200 && artistTask.status === 200, `${labelTask.status} ${artistTask.text.slice(0, 80)}`);
    const labelTaskId = (labelTask.json.task as { id: string }).id, artistTaskId = (artistTask.json.task as { id: string }).id;
    const stored = await prisma.releaseTask.findUnique({ where: { id: artistTaskId } });
    check("a task stores the release's account, not the caller's say-so", stored?.organizationId === pro.id && stored?.note === "Bring the stems");
    check("another label can't edit it", (await call(`${tasksUrl}/${labelTaskId}`, { method: "PATCH", body: { title: "mine" }, as: sOther })).status === 404);
    check("a task id from another release is a 404", (await call(`/api/admin/releases/${otherArtistRel.id}/tasks/${labelTaskId}`, { method: "PATCH", body: { title: "x" }, as: sOwner })).status === 404);

    // Cap: fill to the limit directly, then one more through the route.
    const have = await prisma.releaseTask.count({ where: { releaseId: rel.id } });
    await prisma.releaseTask.createMany({ data: Array.from({ length: TASK_LIMITS.perRelease - have }, (_, i) => ({ releaseId: rel.id, organizationId: pro.id, title: `filler ${i}`, day: 200, assignee: "label" })) });
    check(`a release holds at most ${TASK_LIMITS.perRelease} tasks`, (await call(tasksUrl, { body: { title: "one too many", day: 0 }, as: sOwner })).status === 400);
    await prisma.releaseTask.deleteMany({ where: { releaseId: rel.id, title: { startsWith: "filler " } } });

    // Downgrade: what exists keeps working.
    await prisma.organization.update({ where: { id: pro.id }, data: { plan: "free" } });
    check("after a downgrade, a new task is refused", (await call(tasksUrl, { body: { title: "new", day: 0 }, as: sOwner })).status === 402);
    check("after a downgrade, an existing task can still be edited", (await call(`${tasksUrl}/${labelTaskId}`, { method: "PATCH", body: { note: "still mine" }, as: sOwner })).status === 200);
    await prisma.organization.update({ where: { id: pro.id }, data: { plan: "label" } });

    console.log("\n3. What the artist can tick");
    const plan = "/api/dashboard/plan";
    check("the artist ticks a task given to the artist", (await call(plan, { body: { releaseId: rel.id, key: `task:${artistTaskId}`, done: true }, as: sArtist })).status === 200);
    const ticked = await prisma.releaseTask.findUnique({ where: { id: artistTaskId } });
    check("and droplr records who ticked it", !!ticked?.doneAt && ticked.doneById === artistUser.id);
    check("the artist can't tick the label's task", (await call(plan, { body: { releaseId: rel.id, key: `task:${labelTaskId}`, done: true }, as: sArtist })).status === 403);
    check("the artist can't tick an unassigned step", (await call(plan, { body: { releaseId: rel.id, key: "teaser", done: true }, as: sArtist })).status === 403);
    check("the artist ticks a step assigned to the artist", (await call(plan, { body: { releaseId: rel.id, key: seven.key, done: true }, as: sArtist })).status === 200 && (await prisma.promoTaskDone.count({ where: { releaseId: rel.id, key: seven.key } })) === 1);
    check("the artist can't touch another artist's release", (await call(plan, { body: { releaseId: otherArtistRel.id, key: seven.key, done: true }, as: sArtist })).status === 404);
    check("another label's release is a 404 to the artist", (await call(plan, { body: { releaseId: otherRel.id, key: seven.key, done: true }, as: sArtist })).status === 404);
    check("the label's owner can't use the artist route", (await call(plan, { body: { releaseId: rel.id, key: `task:${artistTaskId}`, done: false }, as: sOwner })).status === 403);
    check("a write from another site is refused", (await call(plan, { body: { releaseId: rel.id, key: `task:${artistTaskId}`, done: false }, as: sArtist, origin: "https://evil.example" })).status === 403);
    check("the email switch refuses another site too", (await call("/api/account/task-emails", { method: "PATCH", body: { on: false }, as: sArtist, origin: "https://evil.example" })).status === 403);
    // Untick both for the reminder section.
    await prisma.releaseTask.update({ where: { id: artistTaskId }, data: { doneAt: null, doneById: null } });
    await prisma.promoTaskDone.deleteMany({ where: { releaseId: rel.id } });

    console.log("\n4. Who gets reminded");
    await prisma.pushSubscription.createMany({ data: [
      { userId: owner.id, endpoint: `https://push.example/owner-${RUN}`, p256dh: "k", auth: "a" },
      { userId: artistUser.id, endpoint: `https://push.example/artist-${RUN}`, p256dh: "k", auth: "a" },
    ] });
    const NOW = new Date(stepDate(releaseDate, TZ, seven.day).getTime() + 3600_000);
    const mine = () => pushes.filter((p) => p.endpoint.endsWith(RUN) && p.payload.includes(rel.id));
    const toOwner = () => mine().filter((p) => p.endpoint.includes("/owner-"));
    const toArtist = () => mine().filter((p) => p.endpoint.includes("/artist-"));
    const mailTo = (u: { email: string }) => mails.filter((m) => m.to === u.email);

    pushes = []; mails = [];
    await notifyDuePromoSteps(NOW, true);
    check("the label's task pushes to the label", toOwner().some((p) => p.payload.includes(`Label job ${RUN}`)), toOwner().map((p) => p.payload.slice(0, 60)).join(" | "));
    check("the label's task never pushes to the artist", !toArtist().some((p) => p.payload.includes(`Label job ${RUN}`)));
    check("the artist's task pushes to the artist", toArtist().some((p) => p.payload.includes(`Artist job ${RUN}`)));
    check("the artist's task never pushes to the label", !toOwner().some((p) => p.payload.includes(`Artist job ${RUN}`)));
    check("the step given to the artist pushes only to the artist", toArtist().some((p) => p.payload.includes(seven.title)) && !toOwner().some((p) => p.payload.includes(seven.title)));
    check("the artist's push opens the artist's dashboard", toArtist().every((p) => p.payload.includes(`/dashboard#release-${rel.id}`)));
    check("the owner gets one email with the label's task", mailTo(owner).length === 1 && mailTo(owner)[0].text.includes(`Label job ${RUN}`) && !mailTo(owner)[0].text.includes(`Artist job ${RUN}`), mailTo(owner).map((m) => m.subject).join(" | "));
    check("the artist gets one email with both of theirs", mailTo(artistUser).length === 1 && mailTo(artistUser)[0].text.includes(`Artist job ${RUN}`) && mailTo(artistUser)[0].text.includes(seven.title), mailTo(artistUser).map((m) => m.subject).join(" | "));
    check("the email says how to turn it off", mailTo(owner)[0]?.text.includes("/admin/settings/account#task-emails-card") && mailTo(artistUser)[0]?.text.includes("/dashboard/account#task-emails-card"));

    pushes = []; mails = [];
    await notifyDuePromoSteps(NOW, true);
    check("a second run sends nothing more", mine().length === 0 && mailTo(owner).length === 0 && mailTo(artistUser).length === 0, `${mine().length} pushes, ${mails.length} mails`);

    // Moving a task's date makes it a new reminder; a login that switched email off gets the push only.
    check("the owner switches task emails off", (await call("/api/account/task-emails", { method: "PATCH", body: { on: false }, as: sOwner })).status === 200);
    check("the switch takes only true or false", (await call("/api/account/task-emails", { method: "PATCH", body: { on: "no" }, as: sOwner })).status === 400);
    await call(`${tasksUrl}/${labelTaskId}`, { method: "PATCH", body: { day: seven.day + 1 }, as: sOwner });
    await call(`${tasksUrl}/${labelTaskId}`, { method: "PATCH", body: { day: seven.day }, as: sOwner });
    check("changing a task's day clears its reminder", (await prisma.releaseTask.findUnique({ where: { id: labelTaskId } }))?.remindedAt === null);
    pushes = []; mails = [];
    await notifyDuePromoSteps(NOW, true);
    check("with email off, the owner still gets the push", toOwner().some((p) => p.payload.includes(`Label job ${RUN}`)));
    check("with email off, the owner gets no email", mailTo(owner).length === 0, mails.map((m) => m.to).join(","));
    await prisma.user.update({ where: { id: owner.id }, data: { taskEmails: true } });

    // A task already done is never reminded; an unassigned step is pushed but never emailed.
    await prisma.releaseTask.update({ where: { id: labelTaskId }, data: { remindedAt: null, doneAt: new Date() } });
    await prisma.promoStepReminder.deleteMany({ where: { releaseId: rel.id } });
    await prisma.promoStepAssign.deleteMany({ where: { releaseId: rel.id } });
    pushes = []; mails = [];
    await notifyDuePromoSteps(NOW, true);
    check("a task already done is never reminded", !mine().some((p) => p.payload.includes(`Label job ${RUN}`)) && (await prisma.releaseTask.findUnique({ where: { id: labelTaskId } }))?.remindedAt === null);
    check("an unassigned step still pushes to label and artist, as before", toOwner().some((p) => p.payload.includes(seven.title)) && toArtist().some((p) => p.payload.includes(seven.title)));
    check("an unassigned step sends no email", !mails.some((m) => m.text.includes(seven.title)), mails.map((m) => m.subject).join(" | "));

    // Two runs at once remind a task once between them.
    await prisma.releaseTask.update({ where: { id: artistTaskId }, data: { remindedAt: null } });
    pushes = []; mails = [];
    await Promise.all([notifyDuePromoSteps(NOW, true), notifyDuePromoSteps(NOW, true)]);
    check("two concurrent runs remind a task once", toArtist().filter((p) => p.payload.includes(`Artist job ${RUN}`)).length === 1 && mailTo(artistUser).length === 1, `${toArtist().length} pushes ${mailTo(artistUser).length} mails`);

    const work = await duePromoWork(pro.id, NOW);
    check("the dashboard lists the artist's task, marked for the artist", work.some((w) => w.custom && w.title === `Artist job ${RUN}` && w.assignee === "artist"));
    check("the dashboard leaves out tasks already done", !work.some((w) => w.title === `Label job ${RUN}`));
    check("another account's dashboard sees none of it", !(await duePromoWork(other.id, NOW)).some((w) => w.releaseId === rel.id));

    console.log("\n5. Pages");
    const twin = await mkRel(pro, "twin", { title: `Twin ${RUN}`, artistName: "Someone Else" });
    const month = new Date(releaseDate.getTime()).toISOString().slice(0, 7);
    const calPage = async (as: string) => (await fetch(`${BASE}/admin/calendar?m=${month}`, { headers: { Cookie: `dfm_session=${as}` }, redirect: "manual" }));
    const cal = await calPage(sOwner);
    const calText = await cal.text();
    check("the calendar shows the account's releases", cal.status === 200 && calText.includes(`Track main ${RUN}`) && calText.includes(`Twin ${RUN}`), `${cal.status}`);
    check("the calendar flags the same-day pair", calText.includes("Clash") && calText.includes("comes out the same day"));
    check("the calendar shows no other account's release", !calText.includes(`Track other ${RUN}`));
    const otherCal = await (await calPage(sOther)).text();
    check("another account's calendar shows none of this one's", !otherCal.includes(`Track main ${RUN}`));
    const detail = await (await fetch(`${BASE}/admin/releases/${rel.id}?tab=promo`, { headers: { Cookie: `dfm_session=${sOwner}` } })).text();
    check("the release page warns about the clash", detail.includes("This release is close to another one") && detail.includes(`Twin ${RUN}`));
    check("the promo tab offers your own task on a team plan", detail.includes("Add your own task") && detail.includes(`Artist job ${RUN}`));
    const freeDetail = await (await fetch(`${BASE}/admin/releases/${freeRel.id}?tab=promo`, { headers: { Cookie: `dfm_session=${sFree}` } })).text();
    const quiet = await (await fetch(`${BASE}/admin/releases/${otherArtistRel.id}?tab=promo`, { headers: { Cookie: `dfm_session=${sOwner}` } })).text();
    check("a release with nothing near it shows no clash warning", quiet.includes("Promo plan") && !quiet.includes("This release is close to another one"));
    check("on Free the promo tab says where the feature is instead", !freeDetail.includes("Add your own task") && freeDetail.includes("on the Pro and Label plans"));
    await prisma.promoStepAssign.create({ data: { releaseId: rel.id, key: "behind", assignee: "artist" } });
    const dash = await (await fetch(`${BASE}/dashboard`, { headers: { Cookie: `dfm_session=${sArtist}` } })).text();
    check("the artist's dashboard lists what was given to the artist", dash.includes("For you on this release") && dash.includes(`Artist job ${RUN}`) && dash.includes("Behind the scenes"));
    check("and not the label's own task", !dash.includes(`Label job ${RUN}`));

    console.log("\n6. Edge cases the review found");
    // A big backlog of open future tasks must not crowd out one that is due now.
    const bulk = await mkOrg("bulk", "label");
    orgs.push(bulk);
    const bulkOwner = await mkUser(bulk, "owner", "bulkowner");
    const far = await mkRel(bulk, "far", { releaseDate: new Date(Date.now() + 300 * DAY) });
    await prisma.releaseTask.createMany({ data: Array.from({ length: 650 }, (_, i) => ({ releaseId: far.id, organizationId: bulk.id, title: `future ${i}`, day: (i % 30) - 10, assignee: "label" })) });
    const dueNow = await prisma.releaseTask.create({ data: { releaseId: rel.id, organizationId: pro.id, title: `Due under a backlog ${RUN}`, day: seven.day, assignee: "label" } });
    pushes = []; mails = [];
    await notifyDuePromoSteps(NOW, true);
    check("a due task is reminded under 650 open future tasks", (await prisma.releaseTask.findUnique({ where: { id: dueNow.id } }))?.remindedAt !== null && toOwner().some((p) => p.payload.includes(`Due under a backlog ${RUN}`)));
    check("none of the future ones were claimed", (await prisma.releaseTask.count({ where: { releaseId: far.id, remindedAt: { not: null } } })) === 0);
    const bulkWork = await duePromoWork(bulk.id, NOW);
    check("future tasks don't appear as due on the dashboard", bulkWork.length === 0, String(bulkWork.length));
    void bulkOwner;

    // Out of time: nothing is claimed, so the next run still has it.
    const late = await prisma.releaseTask.create({ data: { releaseId: rel.id, organizationId: pro.id, title: `Out of time ${RUN}`, day: seven.day, assignee: "label" } });
    await notifyDuePromoSteps(NOW, true, Date.now() - 1);
    check("past the deadline nothing is claimed", (await prisma.releaseTask.findUnique({ where: { id: late.id } }))?.remindedAt === null);
    await notifyDuePromoSteps(NOW, true);
    check("and the next run reminds it", (await prisma.releaseTask.findUnique({ where: { id: late.id } }))?.remindedAt !== null);

    // Push not set up, email set up: an unassigned step must stay unclaimed, an assigned one goes by email.
    const vapid = [process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY];
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
    try {
      await prisma.promoStepReminder.deleteMany({ where: { releaseId: rel.id } });
      await prisma.promoStepAssign.deleteMany({ where: { releaseId: rel.id } });
      await prisma.promoStepAssign.create({ data: { releaseId: rel.id, key: seven.key, assignee: "label" } });
      const noLogin = await mkRel(pro, "nologin", { releaseDate });
      const orphan = await prisma.releaseTask.create({ data: { releaseId: noLogin.id, organizationId: pro.id, title: `Nobody to tell ${RUN}`, day: seven.day, assignee: "artist" } });
      mails = [];
      await notifyDuePromoSteps(NOW, false);
      const told = (await prisma.promoStepReminder.findMany({ where: { releaseId: noLogin.id } })).map((r) => r.key);
      check("with push off, an unassigned step is left unclaimed", told.length === 0, told.join(","));
      check("with push off, an assigned step still goes by email", mailTo(owner).some((m) => m.text.includes(seven.title)) && (await prisma.promoStepReminder.count({ where: { releaseId: rel.id, key: seven.key } })) === 1);
      check("an artist task with no artist login is left unclaimed", (await prisma.releaseTask.findUnique({ where: { id: orphan.id } }))?.remindedAt === null);
    } finally {
      [process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY] = vapid;
    }

    // Planning happens before a release is public.
    const hidden = await mkRel(pro, "hidden", { releaseDate, isPublic: false });
    const hiddenTask = await prisma.releaseTask.create({ data: { releaseId: hidden.id, organizationId: pro.id, title: `Private release job ${RUN}`, day: seven.day, assignee: "label" } });
    await notifyDuePromoSteps(NOW, true);
    check("a task on a private release is reminded", (await prisma.releaseTask.findUnique({ where: { id: hiddenTask.id } }))?.remindedAt !== null);

    // After a downgrade, changing an existing assignment is an edit; a new one is not.
    await prisma.organization.update({ where: { id: pro.id }, data: { plan: "free" } });
    check("after a downgrade, an existing assignment can change", (await call(`/api/admin/releases/${rel.id}/promo`, { body: { key: seven.key, assignee: "artist" }, as: sOwner })).status === 200);
    check("after a downgrade, a new assignment is refused", (await call(`/api/admin/releases/${rel.id}/promo`, { body: { key: "teaser", assignee: "artist" }, as: sOwner })).status === 402 && !(await prisma.promoStepAssign.findFirst({ where: { releaseId: rel.id, key: "teaser" } })));
    await prisma.organization.update({ where: { id: pro.id }, data: { plan: "label" } });

    // Moving the release moves the plan, so its reminders are due again.
    await prisma.promoStepReminder.create({ data: { releaseId: rel.id, key: "teaser" } }).catch(() => null);
    const local = new Date(rel.releaseDate.getTime() + 2 * DAY).toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 16).replace(" ", "T");
    const moved = await call(`/api/admin/releases/${rel.id}`, { method: "PATCH", body: { releaseDateLocal: local }, as: sOwner });
    const afterMove = await prisma.release.findUnique({ where: { id: rel.id }, select: { artistId: true } });
    check("moving the release clears its task reminders", moved.status === 200 && (await prisma.releaseTask.count({ where: { releaseId: rel.id, remindedAt: { not: null } } })) === 0, `${moved.status} ${moved.text.slice(0, 120)}`);
    check("and its step reminders", (await prisma.promoStepReminder.count({ where: { releaseId: rel.id } })) === 0);
    check("and leaves the artist alone", afterMove?.artistId === artistUser.id);

    // A profile on one release and a typed name on the other are still one artist.
    const mixed = findClashes([
      { id: "a", title: "a", artistName: "Planner", artistProfileId: "p1", releaseDate: new Date("2026-12-01T00:00:00Z"), kind: "release" },
      { id: "b", title: "b", artistName: "planner", artistProfileId: null, releaseDate: new Date("2026-12-06T00:00:00Z"), kind: "release" },
    ], TZ);
    check("a profile-linked release and a typed name clash as one artist", mixed.get("a")?.[0]?.reason === "same-artist");

    // Three adds at once on the last free slot leave exactly the cap.
    const now = await prisma.releaseTask.count({ where: { releaseId: rel.id } });
    await prisma.releaseTask.createMany({ data: Array.from({ length: TASK_LIMITS.perRelease - now - 1 }, (_, i) => ({ releaseId: rel.id, organizationId: pro.id, title: `fill ${i}`, day: 300, assignee: "label" })) });
    const race = await Promise.all([0, 1, 2].map((i) => call(tasksUrl, { body: { title: `race ${i}`, day: 1 }, as: sOwner })));
    check(`three adds at once on the last slot leave exactly ${TASK_LIMITS.perRelease}, one of them in`, (await prisma.releaseTask.count({ where: { releaseId: rel.id } })) === TASK_LIMITS.perRelease && race.filter((r) => r.status === 200).length === 1, race.map((r) => r.status).join(","));
    await prisma.releaseTask.deleteMany({ where: { releaseId: rel.id, OR: [{ title: { startsWith: "fill " } }, { title: { startsWith: "race " } }] } });

    // A zone the database doesn't know must not stop reminders for everyone else.
    const odd = await mkOrg("oddzone", "label");
    orgs.push(odd);
    await mkUser(odd, "owner", "oddowner");
    await prisma.$executeRaw`UPDATE "Organization" SET "timezone" = 'Mars/Olympus_Mons' WHERE "id" = ${odd.id}`;
    const oddRel = await mkRel(odd, "odd", { releaseDate });
    const oddTask = await prisma.releaseTask.create({ data: { releaseId: oddRel.id, organizationId: odd.id, title: `Odd zone ${RUN}`, day: seven.day, assignee: "label" } });
    const besideRel = await mkRel(pro, "beside", { releaseDate });
    const fine = await prisma.releaseTask.create({ data: { releaseId: besideRel.id, organizationId: pro.id, title: `Beside an odd zone ${RUN}`, day: seven.day, assignee: "label" } });
    let threw = "";
    await notifyDuePromoSteps(NOW, true).catch((e) => { threw = e instanceof Error ? e.message.slice(0, 120) : String(e); });
    check("an unknown zone on one account doesn't break the job", !threw, threw);
    check("the other account's task is still reminded", (await prisma.releaseTask.findUnique({ where: { id: fine.id } }))?.remindedAt !== null);
    check("the odd account's task falls back to Brisbane, as stepDate does", (await prisma.releaseTask.findUnique({ where: { id: oddTask.id } }))?.remindedAt !== null);
    check("an offset is not accepted as a timezone", !isValidTimeZone("+10:00") && !isValidTimeZone("-05:00") && isValidTimeZone("EST5EDT") && isValidTimeZone("Australia/Brisbane"));
    check("the settings route refuses an offset timezone", (await call("/api/admin/org", { method: "PATCH", body: { timezone: "+10:00" }, as: sOwner })).status === 400);

    // Changing the account's timezone moves every release's day, so reminders are due again.
    await prisma.promoStepReminder.create({ data: { releaseId: rel.id, key: "announce" } }).catch(() => null);
    const tzMove = await call("/api/admin/org", { method: "PATCH", body: { timezone: "Europe/London" }, as: sOwner });
    check("a timezone change clears the account's task reminders", tzMove.status === 200 && (await prisma.releaseTask.count({ where: { organizationId: pro.id, remindedAt: { not: null } } })) === 0, `${tzMove.status} ${tzMove.text.slice(0, 100)}`);
    check("and its step reminders", (await prisma.promoStepReminder.count({ where: { release: { organizationId: pro.id } } })) === 0);
    check("and leaves other accounts' alone", (await prisma.releaseTask.findUnique({ where: { id: oddTask.id } }))?.remindedAt !== null);
    await prisma.organization.update({ where: { id: pro.id }, data: { timezone: TZ } });

    const blank = findClashes([
      { id: "a", title: "a", artistName: " ", artistProfileId: "p1", releaseDate: new Date("2026-12-01T00:00:00Z"), kind: "release" },
      { id: "b", title: "b", artistName: "", artistProfileId: "p2", releaseDate: new Date("2026-12-06T00:00:00Z"), kind: "release" },
    ], TZ);
    check("two blank artist names are not the same artist", blank.size === 0);
  } finally {
    const ids = orgs.map((o) => o.id);
    await prisma.pushSubscription.deleteMany({ where: { user: { organizationId: { in: ids } } } });
    await prisma.release.deleteMany({ where: { organizationId: { in: ids } } });
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
