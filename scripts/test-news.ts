/**
 * News emails: who is allowed to receive one, and who must never.
 *
 * The rule these tests defend: release-day consent covers exactly one release, and only
 * the separate, optional "news and new music" box makes a fan reachable for anything else
 * (Spam Act 2003). Everything here is about that line not moving.
 *
 * Runs against the local database with Resend mocked. Never point it at Neon.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/db";
import { canSendNews, findDueNewsEmails, localSendWindow, newsAudience, newsAudienceCount, newsAudienceCounts, processNewsEmail, renderNewsEmail, snapshotAudience } from "../src/lib/news";
import { zonedDay, zonedLocalToDate } from "../src/lib/time";

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

// Mock Resend so nothing leaves the machine.
let sentTo: string[] = [];
let failNext: string | null = null;
let batchCalls = 0;
let maxBatch = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url);
  if (u.includes("api.resend.com")) {
    const body = JSON.parse(String(init?.body)) as { to: string[] }[];
    batchCalls++;
    maxBatch = Math.max(maxBatch, body.length);
    if (failNext && body.some((m) => m.to[0] === failNext)) {
      return new Response(JSON.stringify({ message: "invalid address" }), { status: 422 });
    }
    sentTo.push(...body.map((m) => m.to[0]));
    return new Response("{}", { status: 200 });
  }
  return realFetch(url as never, init);
}) as typeof fetch;

async function org(tag: string, plan: string) {
  const o = await prisma.organization.create({
    data: { name: `News ${tag} ${RUN}`, slug: `news-${tag}-${RUN}`, plan, timezone: "Australia/Brisbane" },
  });
  const rel = await prisma.release.create({
    data: {
      organizationId: o.id, slug: `news-rel-${tag}-${RUN}`, title: `Track ${tag}`, artistName: `Artist ${tag}`,
      coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() - 86400_000), rollout: "local",
    },
  });
  const rel2 = await prisma.release.create({
    data: {
      organizationId: o.id, slug: `news-rel2-${tag}-${RUN}`, title: `Other ${tag}`, artistName: `Artist ${tag}`,
      coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() - 86400_000), rollout: "local",
    },
  });
  return { o, rel, rel2 };
}

const fan = (releaseId: string, email: string, extra: Record<string, unknown> = {}) => ({
  releaseId, platform: "email", email, emailConsent: true, consentAt: new Date(), ...extra,
});

async function main() {
  console.log(`News email tests (run ${RUN})`);
  const A = await org("a", "label");
  const B = await org("b", "label");
  const F = await org("f", "free");

  // A: one opted in, one release-only, one opted in then unsubscribed, one on a second release.
  const optedIn = `yes-${RUN}@fans.dev`;
  const releaseOnly = `no-${RUN}@fans.dev`;
  const gone = `gone-${RUN}@fans.dev`;
  const otherRelease = `other-${RUN}@fans.dev`;
  const auFan = `au-${RUN}@fans.dev`;

  await prisma.preSave.createMany({
    data: [
      fan(A.rel.id, optedIn, { newsConsent: true, newsConsentAt: new Date(), country: "GB", listenOn: "spotify" }),
      fan(A.rel.id, releaseOnly, { newsConsent: false, country: "GB" }),
      fan(A.rel.id, gone, { newsConsent: true, newsConsentAt: new Date(), status: "unsubscribed" }),
      fan(A.rel2.id, otherRelease, { newsConsent: true, newsConsentAt: new Date(), country: "US", listenOn: "beatport" }),
      fan(A.rel.id, auFan, { newsConsent: true, newsConsentAt: new Date(), country: "AU", listenOn: "spotify" }),
      fan(B.rel.id, `b-${RUN}@fans.dev`, { newsConsent: true, newsConsentAt: new Date() }),
    ],
  });

  try {
    // --- Audience ---
    const aud = await newsAudience(A.o.id, {});
    const emails = aud.map((r) => r.email).sort();
    check("audience is only fans who opted in to news", emails.join(",") === [auFan, optedIn, otherRelease].sort().join(","), emails.join(","));
    check("a release-only fan is never in the audience", !emails.includes(releaseOnly));
    check("an unsubscribed fan is never in the audience", !emails.includes(gone));
    check("another label's fans are never in the audience", !emails.some((e) => e.startsWith("b-")));
    check("every recipient carries a PreSave id for the unsubscribe link", aud.every((r) => !!r.preSaveId));

    check("count matches the audience", (await newsAudienceCount(A.o.id, {})) === 3);
    check("country filter narrows it", (await newsAudienceCount(A.o.id, { country: "AU" })) === 1);
    check("store filter narrows it", (await newsAudienceCount(A.o.id, { listenOn: "beatport" })) === 1);
    check("release filter narrows it", (await newsAudienceCount(A.o.id, { releaseId: A.rel2.id })) === 1);
    check("filters combine", (await newsAudienceCount(A.o.id, { country: "AU", listenOn: "beatport" })) === 0);

    // --- Plan gating ---
    check("Free plan can't send news emails", !canSendNews("free"));
    check("paid plans can", canSendNews("artist") && canSendNews("artist_pro") && canSendNews("pro") && canSendNews("label"));

    // --- Render ---
    const tpl = renderNewsEmail({
      subject: "Hello <b>there</b>", body: "Line one\n\nLine two & more", orgName: "Test Label", unsub: "TOKEN", showBranding: true,
      buttonLabel: "Listen", buttonUrl: "https://example.com/x",
    });
    check("subject and body are escaped, never raw HTML", tpl.html.includes("Hello &lt;b&gt;there&lt;/b&gt;") && tpl.html.includes("more") && !tpl.html.includes("<b>there</b>"));
    check("blank lines become paragraphs", (tpl.html.match(/<p style="margin:0 0 16px;/g) ?? []).length >= 2);
    check("an unsubscribe link is always present", tpl.html.includes("/api/unsubscribe?t=TOKEN") && tpl.text.includes("/api/unsubscribe?t=TOKEN"));
    check("one-click unsubscribe headers are set", tpl.headers["List-Unsubscribe"].includes("TOKEN") && tpl.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click");
    check("a non-https button link is dropped", !renderNewsEmail({ subject: "s", body: "b", orgName: "o", unsub: "T", buttonLabel: "Go", buttonUrl: "javascript:alert(1)" }).html.includes("javascript:"));

    // --- Sending ---
    const news = await prisma.newsEmail.create({
      data: { organizationId: A.o.id, subject: `Test ${RUN}`, body: "Hello fans", status: "scheduled" },
    });
    const frozen = await snapshotAudience(news.id);
    check("the audience is frozen before sending", frozen === 3, String(frozen));

    sentTo = [];
    const r1 = await processNewsEmail(news.id, Date.now() + 20_000);
    check("send reaches exactly the opted-in fans", sentTo.sort().join(",") === [auFan, optedIn, otherRelease].sort().join(","), sentTo.join(","));
    check("the release-only fan got nothing", !sentTo.includes(releaseOnly));
    check("the unsubscribed fan got nothing", !sentTo.includes(gone));
    check("result counts the sends", r1.sent === 3 && r1.failed === 0, JSON.stringify(r1));
    check("the email is marked sent", (await prisma.newsEmail.findUnique({ where: { id: news.id } }))?.status === "sent");

    // --- Re-running must not double send ---
    sentTo = [];
    const again = await processNewsEmail(news.id, Date.now() + 5_000);
    check("re-running sends nobody twice", sentTo.length === 0, sentTo.join(","));
    check("a finished send is not picked up again", again.sent === 0);

    // --- Concurrency: the lease must let exactly one through ---
    const news2 = await prisma.newsEmail.create({ data: { organizationId: A.o.id, subject: `Race ${RUN}`, body: "x", status: "scheduled" } });
    await snapshotAudience(news2.id);
    sentTo = [];
    const [ca, cb] = await Promise.all([processNewsEmail(news2.id, Date.now() + 8_000), processNewsEmail(news2.id, Date.now() + 8_000)]);
    const blocked = [ca, cb].filter((r) => r.notes.includes("already being processed by another run")).length;
    check("two concurrent runs: exactly one is blocked", blocked === 1, `blocked ${blocked}`);
    check("concurrent runs send each fan once", new Set(sentTo).size === sentTo.length && sentTo.length === 3, sentTo.join(","));

    // --- Unsubscribing between snapshot and send ---
    const news3 = await prisma.newsEmail.create({ data: { organizationId: A.o.id, subject: `Late ${RUN}`, body: "x", status: "scheduled" } });
    await snapshotAudience(news3.id);
    await prisma.preSave.updateMany({ where: { email: auFan }, data: { status: "unsubscribed", newsConsent: false } });
    sentTo = [];
    await processNewsEmail(news3.id, Date.now() + 10_000);
    check("someone who unsubscribes after the snapshot is dropped before sending", !sentTo.includes(auFan), sentTo.join(","));
    check("everyone else still gets it", sentTo.length === 2, sentTo.join(","));

    // --- Free plan is refused at send time, not just in the UI ---
    const freeRel = await prisma.release.findFirst({ where: { organizationId: F.o.id } });
    if (!freeRel) {
      const r = await prisma.release.create({
        data: { organizationId: F.o.id, slug: `free-rel-${RUN}`, title: "Free", artistName: "Free", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(), rollout: "local" },
      });
      await prisma.preSave.create({ data: fan(r.id, `free-${RUN}@fans.dev`, { newsConsent: true, newsConsentAt: new Date() }) });
    }
    const freeNews = await prisma.newsEmail.create({ data: { organizationId: F.o.id, subject: `Free ${RUN}`, body: "x", status: "scheduled" } });
    sentTo = [];
    await processNewsEmail(freeNews.id, Date.now() + 5_000);
    check("a Free account's send is refused by the worker", sentTo.length === 0 && (await prisma.newsEmail.findUnique({ where: { id: freeNews.id } }))?.status === "failed");

    // --- One bad address must not stop the batch ---
    const news4 = await prisma.newsEmail.create({ data: { organizationId: A.o.id, subject: `Bad ${RUN}`, body: "x", status: "scheduled" } });
    await snapshotAudience(news4.id);
    sentTo = [];
    failNext = optedIn;
    const r4 = await processNewsEmail(news4.id, Date.now() + 20_000);
    failNext = null;
    check("a rejected address is recorded and the rest still go", r4.failed === 1 && sentTo.includes(otherRelease) && !sentTo.includes(optedIn), JSON.stringify(r4));
    check("the failure is stored against that recipient", !!(await prisma.newsEmailDelivery.findFirst({ where: { newsEmailId: news4.id, email: optedIn, error: { not: null } } })));

    // --- Local-time sending ---
    // Release-day emails already land at the fan's own 9am; a news email can now do the same. The whole
    // trick is that each recipient's moment is worked out once, at snapshot, so the send loop only
    // compares timestamps. A local send is therefore a normal resumable send that happens to span a day.
    console.log("\n  Local-time sending");
    const ukFan = `uk-${RUN}@fans.dev`;
    const laFan = `la-${RUN}@fans.dev`;
    const nowhereFan = `nowhere-${RUN}@fans.dev`;
    await prisma.preSave.createMany({
      data: [
        fan(A.rel.id, ukFan, { newsConsent: true, newsConsentAt: new Date(), timezone: "Europe/London" }),
        fan(A.rel.id, laFan, { newsConsent: true, newsConsentAt: new Date(), timezone: "America/Los_Angeles" }),
        fan(A.rel.id, nowhereFan, { newsConsent: true, newsConsentAt: new Date() }),
      ],
    });
    const zoned = await newsAudience(A.o.id, {});
    check("the audience carries each fan's timezone", zoned.find((r) => r.email === ukFan)?.timezone === "Europe/London");
    check("a fan with no timezone comes back null, not guessed", zoned.find((r) => r.email === nowhereFan)?.timezone === null);
    const counts = await newsAudienceCounts(A.o.id, {});
    check("the composer can say how many have no timezone", counts.noTimezone >= 1 && counts.noTimezone < counts.total, JSON.stringify(counts));

    // 9am Saturday, Brisbane, as the composer would send it.
    const day = "2099-06-20";
    const localNews = await prisma.newsEmail.create({
      data: {
        organizationId: A.o.id, subject: `Local ${RUN}`, body: "x", status: "scheduled",
        sendMode: "local", localHour: 9, scheduledFor: zonedLocalToDate(`${day}T09:00`, "Australia/Brisbane"),
      },
    });
    await snapshotAudience(localNews.id);
    const rows = await prisma.newsEmailDelivery.findMany({ where: { newsEmailId: localNews.id }, select: { email: true, sendAfter: true } });
    const at = (e: string) => rows.find((r) => r.email === e)?.sendAfter;
    check("every recipient gets their own moment", rows.every((r) => !!r.sendAfter), String(rows.filter((r) => !r.sendAfter).length));
    check("a UK fan is due at 9am London", at(ukFan)?.toISOString() === zonedLocalToDate(`${day}T09:00`, "Europe/London").toISOString(), String(at(ukFan)));
    check("an LA fan is due at 9am Los Angeles", at(laFan)?.toISOString() === zonedLocalToDate(`${day}T09:00`, "America/Los_Angeles").toISOString(), String(at(laFan)));
    check("a fan with no timezone falls back to the label's hour", at(nowhereFan)?.toISOString() === zonedLocalToDate(`${day}T09:00`, "Australia/Brisbane").toISOString(), String(at(nowhereFan)));
    check("Brisbane comes first, then London, then LA", at(nowhereFan)!.getTime() < at(ukFan)!.getTime() && at(ukFan)!.getTime() < at(laFan)!.getTime());
    // Brisbane (UTC+10) to Los Angeles (UTC−7 in June) is 17 hours; the full UTC+14…UTC−12 window is 26.
    check("the send spans the gap between the zones, not a moment", at(laFan)!.getTime() - at(nowhereFan)!.getTime() === 17 * 3600_000, String((at(laFan)!.getTime() - at(nowhereFan)!.getTime()) / 3600_000));

    const win = localSendWindow({ sendMode: "local", localHour: 9, scheduledFor: zonedLocalToDate(`${day}T09:00`, "Australia/Brisbane") }, "Australia/Brisbane");
    check("the window covers every zone the fans are in", !!win && win.earliest.getTime() <= at(nowhereFan)!.getTime() && win.latest.getTime() >= at(laFan)!.getTime());
    check("an instant send has no window", localSendWindow({ sendMode: "instant", localHour: null, scheduledFor: new Date() }, "Australia/Brisbane") === null);
    check("the label's own day is what gets scheduled", zonedDay(zonedLocalToDate(`${day}T09:00`, "Australia/Brisbane"), "Australia/Brisbane") === day);

    // Nobody's hour has come round yet (the day is in 2099), so a run must send nothing and leave it sending.
    sentTo = [];
    const early = await processNewsEmail(localNews.id, Date.now() + 5_000);
    check("nothing goes out before anyone's local hour", sentTo.length === 0 && early.sent === 0, sentTo.join(","));
    check("the send stays open rather than being marked done", (await prisma.newsEmail.findUnique({ where: { id: localNews.id } }))?.status === "sending");

    // Bring the UK fan's moment forward: only that one should go.
    await prisma.newsEmailDelivery.updateMany({ where: { newsEmailId: localNews.id, email: ukFan }, data: { sendAfter: new Date(Date.now() - 60_000) } });
    sentTo = [];
    await processNewsEmail(localNews.id, Date.now() + 10_000);
    check("only the recipients whose hour has come are sent", sentTo.join(",") === ukFan, sentTo.join(","));
    check("the rest are still waiting, not failed", (await prisma.newsEmailDelivery.count({ where: { newsEmailId: localNews.id, sentAt: null, error: null } })) === rows.length - 1);
    check("it is still sending, a day out from finishing", (await prisma.newsEmail.findUnique({ where: { id: localNews.id } }))?.status === "sending");

    // The cron has to pick a local send up before the label's own moment, or UTC+14 misses its 9am.
    await prisma.newsEmail.update({ where: { id: localNews.id }, data: { status: "scheduled" } });
    const soonish = zonedLocalToDate(`${zonedDay(new Date(Date.now() + 20 * 3600_000), "Australia/Brisbane")}T09:00`, "Australia/Brisbane");
    await prisma.newsEmail.update({ where: { id: localNews.id }, data: { scheduledFor: soonish } });
    const due = await findDueNewsEmails();
    check("a local send is picked up 26 hours early", due.some((r) => r.id === localNews.id), `${due.length} due`);
    await prisma.newsEmail.update({ where: { id: localNews.id }, data: { sendMode: "instant", localHour: null } });
    check("an instant send at the same time is not", !(await findDueNewsEmails()).some((r) => r.id === localNews.id));

    // --- Tenant isolation at the data layer ---
    check("label B's audience never includes label A's fans", (await newsAudience(B.o.id, {})).every((r) => !r.email.includes(`-${RUN}@fans.dev`) || r.email.startsWith("b-")));
    check("a release filter from another label matches nobody", (await newsAudienceCount(B.o.id, { releaseId: A.rel.id })) === 0);
  } finally {
    await prisma.organization.deleteMany({ where: { slug: { in: [A.o.slug, B.o.slug, F.o.slug] } } });
    globalThis.fetch = realFetch;
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
