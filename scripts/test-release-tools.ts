/**
 * Promo plan reminders and the shareable release report.
 *
 * What these defend:
 *  - a reminder is never sent twice, and never for a step already ticked off;
 *  - a release report does not exist until the label asks for one, stops existing the
 *    moment they turn it off, and never carries anything that identifies a fan.
 *
 * Local database only, push captured in memory. Never point it at Neon.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { disableReport, enableReport, reportByToken } from "../src/lib/report";
import { notifyDuePromoSteps, duePromoWork } from "../src/lib/promo-reminders";
import { promoSteps, stepDate } from "../src/lib/promo";
import { setPushSenderForTests } from "../src/lib/push";

for (const name of ["NETLIFY_DATABASE_URL", "DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  const raw = process.env[name];
  if (!raw) continue;
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    host = raw;
  }
  if (host.includes("neon.tech") && process.env.ALLOW_PROD_TEST !== "1") {
    console.error(`Refusing to run: ${name} points at ${host} (production).`);
    process.exit(1);
  }
}

const RUN = randomBytes(3).toString("hex");
let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
}

let pushes: string[] = [];
setPushSenderForTests(async (_sub, payload) => {
  pushes.push(payload);
  return true;
});

const TZ = "Australia/Brisbane";

async function main() {
  console.log(`Release tools tests (run ${RUN})`);

  const org = await prisma.organization.create({ data: { name: `Tools ${RUN}`, slug: `tools-${RUN}`, plan: "label", kind: "label", timezone: TZ } });
  const owner = await prisma.user.create({
    data: { email: `owner-${RUN}@sectest.dev`, passwordHash: await bcrypt.hash(`pw-${RUN}-long-enough`, 4), role: "owner", organizationId: org.id, emailVerifiedAt: new Date() },
  });
  await prisma.pushSubscription.create({
    data: { userId: owner.id, endpoint: `https://push.test/${RUN}`, p256dh: "a".repeat(80), auth: "b".repeat(22) },
  });

  const other = await prisma.organization.create({ data: { name: `Other ${RUN}`, slug: `other-${RUN}`, plan: "label", kind: "label", timezone: TZ } });

  // A release whose "-7 days" step came due a few hours ago.
  const steps = promoSteps("label");
  const sevenOut = steps.find((s) => s.key === "countdown-7")!;
  const releaseDate = new Date(Date.now() + 7 * 86_400_000 - 3 * 3600_000);
  const rel = await prisma.release.create({
    data: {
      organizationId: org.id, slug: `tools-rel-${RUN}`, title: `Due Track ${RUN}`, artistName: "Tools Artist",
      coverUrl: "https://example.com/c.jpg", releaseDate, rollout: "local", isPublic: true,
    },
  });

  try {
    // --- Promo reminders ---
    // stepDate anchors to noon in the org's timezone, so "now" decides whether a step has landed.
    // Drive the job from a fixed point an hour after the -7 step instead of the wall clock, or this
    // whole section passes in the afternoon and fails every morning.
    const sevenOutAt = stepDate(releaseDate, TZ, sevenOut.day);
    const NOW = new Date(sevenOutAt.getTime() + 3600_000);
    check("the -7 day step is due at the point we run the job", sevenOutAt.getTime() <= NOW.getTime(), sevenOutAt.toISOString());

    pushes = [];
    // The job is global, and a shared local database may hold other test releases, so assert
    // on what actually reached this org's device rather than on the global release count.
    await notifyDuePromoSteps(NOW, true);
    const mine = pushes.filter((p) => p.includes(rel.id));
    check("a due step sends exactly one push to this org", mine.length === 1, `${mine.length} of ${pushes.length}`);
    check("the push points at the promo tab", !!mine[0]?.includes(`/admin/releases/${rel.id}?tab=promo`), mine[0]?.slice(0, 120));

    pushes = [];
    await notifyDuePromoSteps(NOW, true);
    check("running again sends nothing for this release", pushes.filter((p) => p.includes(rel.id)).length === 0, String(pushes.length));

    check("the reminder was recorded once", (await prisma.promoStepReminder.count({ where: { releaseId: rel.id } })) >= 1);

    // A step already ticked off must never be nudged.
    const storeCheck = steps.find((s) => s.key === "store-check")!;
    await prisma.promoTaskDone.create({ data: { releaseId: rel.id, key: storeCheck.key } });
    await prisma.promoStepReminder.deleteMany({ where: { releaseId: rel.id } });
    pushes = [];
    await notifyDuePromoSteps(NOW, true);
    const toldKeys = (await prisma.promoStepReminder.findMany({ where: { releaseId: rel.id }, select: { key: true } })).map((r) => r.key);
    check("a step already done is never nudged", !toldKeys.includes(storeCheck.key), toldKeys.join(","));

    // Steps far in the past stay quiet, so adding a release late doesn't fire everything.
    check("an old step outside the window stays quiet", !toldKeys.includes("announce"), toldKeys.join(","));

    // Two runs at once: the unique claim means only one can push.
    await prisma.promoStepReminder.deleteMany({ where: { releaseId: rel.id } });
    pushes = [];
    await Promise.all([notifyDuePromoSteps(NOW, true), notifyDuePromoSteps(NOW, true)]);
    check("two concurrent runs push once between them", pushes.filter((p) => p.includes(rel.id)).length === 1, `${pushes.filter((p) => p.includes(rel.id)).length} pushes`);

    // The dashboard view is read-only.
    const before = await prisma.promoStepReminder.count({ where: { releaseId: rel.id } });
    const work = await duePromoWork(org.id, NOW);
    check("due work lists something for this release", work.some((w) => w.releaseId === rel.id), String(work.length));
    check("listing due work claims nothing", (await prisma.promoStepReminder.count({ where: { releaseId: rel.id } })) === before);
    check("due work excludes steps already done", !work.some((w) => w.key === storeCheck.key));
    check("due work is scoped to the org", (await duePromoWork(other.id, NOW)).length === 0);

    // --- Interest flags (captured before the features exist) ---
    const fresh = await prisma.release.findUnique({ where: { id: rel.id }, select: { poolOptIn: true, poolOptInAt: true } });
    check("a release is not opted into the pool by default", fresh?.poolOptIn === false && fresh?.poolOptInAt === null);
    await prisma.release.update({ where: { id: rel.id }, data: { poolOptIn: true, poolOptInAt: new Date() } });
    const opted = await prisma.release.findUnique({ where: { id: rel.id }, select: { poolOptIn: true, poolOptInAt: true } });
    check("opting in records when it was ticked", opted?.poolOptIn === true && !!opted?.poolOptInAt);

    const prof = await prisma.artist.create({ data: { organizationId: org.id, name: `Flag Artist ${RUN}` } });
    const p0 = await prisma.artist.findUnique({ where: { id: prof.id }, select: { bookingsOpen: true, bookingsOpenAt: true } });
    check("an artist is not open to bookings by default", p0?.bookingsOpen === false && p0?.bookingsOpenAt === null);

    // Ticking must not make anything visible: the report is still the only public surface,
    // and it says nothing about either flag.
    const flagToken = await enableReport(rel.id);
    const flagReport = JSON.stringify(await reportByToken(flagToken));
    check("the public report never mentions the pool or bookings flags", !flagReport.includes("poolOptIn") && !flagReport.includes("bookingsOpen"));
    await disableReport(rel.id);

    // --- Release report ---
    check("a release has no report until asked", !(await prisma.release.findUnique({ where: { id: rel.id } }))?.reportToken);
    check("a junk token resolves to nothing", (await reportByToken("not-a-real-token-at-all")) === null);
    check("a short token is refused outright", (await reportByToken("abc")) === null);

    const token = await enableReport(rel.id);
    check("enabling issues a long, unguessable token", token.length >= 20, `${token.length} chars`);

    const report = await reportByToken(token);
    check("the report resolves", !!report && report.release.id === rel.id);
    check("the report carries the release and label name", report?.release.title === `Due Track ${RUN}` && report?.org.name === `Tools ${RUN}`);

    // The whole point: aggregate only.
    const blob = JSON.stringify(report);
    check("the report body contains no email address", !/[\w.+-]+@[\w-]+\.[\w.]+/.test(blob), (blob.match(/[\w.+-]+@[\w-]+\.[\w.]+/) ?? [""])[0]);
    check("the report exposes no PreSave rows", !blob.includes("preSaves") && !blob.includes("emailConsent"));
    check("the report exposes no fan timezone or anonId", !blob.includes("anonId") && !blob.includes("ipHash"));

    const rotated = await enableReport(rel.id);
    check("rotating issues a different token", rotated !== token);
    check("the old link stops working immediately", (await reportByToken(token)) === null);
    check("the new link works", !!(await reportByToken(rotated)));

    await disableReport(rel.id);
    check("turning sharing off kills the link", (await reportByToken(rotated)) === null);
    check("turning sharing off clears the stored token", !(await prisma.release.findUnique({ where: { id: rel.id } }))?.reportToken);
  } finally {
    setPushSenderForTests(null);
    await prisma.organization.deleteMany({ where: { slug: { in: [org.slug, other.slug] } } });
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
