/**
 * Release timing + fan platform choice, against the local database (no server needed; Resend/Spotify/stores are mocked).
 *   npx tsx scripts/test-release-timing.ts
 * Checks: per-timezone unlock maths, emails only go to fans whose local moment has come, fans who picked a store
 * with no link wait, their pick leads the email, overlapping runs can't double-send, pre-release store scans are queued.
 */
import { prisma } from "../src/lib/db";
import { findDueReleases, processRelease } from "../src/lib/presave-processor";
import { statsRange } from "../src/lib/analytics";
import { freeMonthPercent, runReferralChecks } from "../src/lib/referrals";
import { notifyPresaveMilestone, setPushSenderForTests } from "../src/lib/push";
import { notifyLiveReleases } from "../src/lib/push-live";
import { dateToZonedLocal, releaseEmailDueFor, releaseInstantFor, releaseWindow, zonedLocalToDate } from "../src/lib/time";

for (const name of ["NETLIFY_DATABASE_URL", "DATABASE_URL"]) {
  if ((process.env[name] ?? "").includes("neon.tech")) {
    console.error(`Refusing to run against production (${name}).`);
    process.exit(1);
  }
}

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(name);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` (${detail})`}`);
};
const iso = (d: Date) => d.toISOString();

async function main() {
  console.log("1. Timezone maths");
  const bris = zonedLocalToDate("2026-09-25T00:00", "Australia/Brisbane");
  const local = { releaseDate: bris, rollout: "local" };
  check("LA unlocks at LA midnight", iso(releaseInstantFor(local, "Australia/Brisbane", "America/Los_Angeles")) === "2026-09-25T07:00:00.000Z");
  check("London unlocks at London midnight (BST)", iso(releaseInstantFor(local, "Australia/Brisbane", "Europe/London")) === "2026-09-24T23:00:00.000Z");
  check("unknown fan zone → label's moment", iso(releaseInstantFor(local, "Australia/Brisbane", "Not/AZone")) === iso(bris));
  check("global rollout ignores fan zone", iso(releaseInstantFor({ releaseDate: bris, rollout: "global" }, "Australia/Brisbane", "America/Los_Angeles")) === iso(bris));
  check("9am email in LA", iso(releaseEmailDueFor(local, "Australia/Brisbane", "America/Los_Angeles", 9)) === "2026-09-25T16:00:00.000Z");
  check("10pm drop → 9am next morning", iso(releaseEmailDueFor({ releaseDate: zonedLocalToDate("2026-09-25T22:00", "Australia/Brisbane"), rollout: "local" }, "Australia/Brisbane", "Australia/Brisbane", 9)) === "2026-09-25T23:00:00.000Z");
  check("5pm drop → at 5pm", iso(releaseEmailDueFor({ releaseDate: zonedLocalToDate("2026-09-25T17:00", "Australia/Brisbane"), rollout: "local" }, "Australia/Brisbane", "Australia/Brisbane", 9)) === "2026-09-25T07:00:00.000Z");
  check("analytics range clamps to the plan", statsRange("365", 30) === 30 && statsRange("90", 90) === 90 && statsRange("365", Infinity) === 365 && statsRange("junk", 90) === 30);
  const w = releaseWindow(local, "Australia/Brisbane");
  check("window spans UTC+14 to UTC−12", iso(w.earliest) === "2026-09-24T10:00:00.000Z" && iso(w.latest) === "2026-09-25T12:00:00.000Z");

  console.log("\n2. Release-day processing by fan timezone");
  process.env.RESEND_API_KEY = "test";
  process.env.RESEND_FROM_EMAIL = "presave@droplr.test";
  const sent: { to: string; html: string }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("api.resend.com")) {
      for (const m of JSON.parse(String(init?.body)) as { to: string[]; html: string }[]) sent.push({ to: m.to[0], html: m.html });
      await new Promise((r) => setTimeout(r, 300)); // slow enough for the overlap check
      return new Response("{}", { status: 200 });
    }
    return new Response("{}", { status: 404 }); // every store lookup: nothing found
  }) as typeof fetch;

  const tag = Date.now().toString(36);
  const refOrgs: string[] = [];
  // Label in Brisbane; release at Brisbane wall-clock now+2h. Kiritimati (UTC+14, 4h ahead of Brisbane) is already past it.
  const org = await prisma.organization.create({ data: { name: `Timing ${tag}`, slug: `timing-${tag}`, plan: "label", timezone: "Australia/Brisbane", releaseEmailHour: null } });
  try {
    const wall = dateToZonedLocal(new Date(Date.now() + 2 * 3600_000), "Australia/Brisbane");
    const release = await prisma.release.create({
      data: {
        organizationId: org.id, slug: `timing-${tag}`, title: "Timing", artistName: "Tester", coverUrl: "https://example.com/c.jpg",
        releaseDate: zonedLocalToDate(wall, "Australia/Brisbane"), rollout: "local", autoReResolve: false,
        links: { create: [{ platform: "appleMusic", url: "https://music.apple.com/au/album/x/1", position: 0 }, { platform: "spotify", url: "https://open.spotify.com/album/x", position: 1 }] },
      },
    });
    const fan = (email: string, timezone: string | null, listenOn: string | null = null) =>
      prisma.preSave.create({ data: { releaseId: release.id, platform: "email", email, emailConsent: true, timezone, listenOn } });
    await fan(`kiri-${tag}@fans.test`, "Pacific/Kiritimati");
    await fan(`kiri-spotify-${tag}@fans.test`, "Pacific/Kiritimati", "spotify");
    await fan(`kiri-beatport-${tag}@fans.test`, "Pacific/Kiritimati", "beatport");
    await fan(`la-${tag}@fans.test`, "America/Los_Angeles");
    await fan(`nozone-${tag}@fans.test`, null);

    const due = await findDueReleases();
    check("release is due once it's out somewhere", due.some((r) => r.id === release.id));

    const [a, b] = await Promise.all([processRelease(release.id, Date.now() + 60_000), processRelease(release.id, Date.now() + 60_000)]);
    check("overlapping runs: one waits", [a, b].filter((r) => r.notes.includes("already being processed by another run")).length === 1, JSON.stringify([a.notes, b.notes]));
    const to = sent.map((m) => m.to);
    check("Kiritimati fans with no pick / a linked pick get it now", to.includes(`kiri-${tag}@fans.test`) && to.includes(`kiri-spotify-${tag}@fans.test`), to.join(","));
    check("fan who picked Beatport (no link yet) waits", !to.includes(`kiri-beatport-${tag}@fans.test`));
    check("LA fan and label-timezone fan not yet", !to.includes(`la-${tag}@fans.test`) && !to.includes(`nozone-${tag}@fans.test`));
    check("each address emailed once", new Set(to).size === to.length && to.length === 2, to.join(","));
    const spotifyMail = sent.find((m) => m.to === `kiri-spotify-${tag}@fans.test`)?.html ?? "";
    check("fan's pick leads their email", spotifyMail.indexOf("on Spotify") > -1 && spotifyMail.indexOf("on Spotify") < spotifyMail.indexOf("on Apple Music"));
    const release2 = await prisma.release.findUniqueOrThrow({ where: { id: release.id } });
    check("status stays upcoming until the label's own moment", release2.status === "upcoming" && !release2.processingUntil);

    // 7 hours later for the Beatport fan (past the 6h wait): simulate by moving the release back.
    await prisma.release.update({ where: { id: release.id }, data: { releaseDate: new Date(release.releaseDate.getTime() - 9 * 3600_000) } });
    await processRelease(release.id, Date.now() + 60_000);
    const to2 = sent.map((m) => m.to);
    check("after the wait the Beatport fan gets All platforms", to2.includes(`kiri-beatport-${tag}@fans.test`));
    check("label-timezone fan gets it once it's out in Brisbane", to2.includes(`nozone-${tag}@fans.test`));

    console.log("\n3. Free plan release-day email cap");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "free" } });
    const capRel = await prisma.release.create({
      data: { organizationId: org.id, slug: `timing-cap-${tag}`, title: "Cap", artistName: "Tester", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() - 20 * 3600_000), rollout: "global", autoReResolve: false, status: "live",
        links: { create: [{ platform: "spotify", url: "https://open.spotify.com/album/y", position: 0 }] } },
    });
    await prisma.preSave.createMany({ data: Array.from({ length: 260 }, (_, i) => ({ releaseId: capRel.id, platform: "email", email: `cap${i}-${tag}@fans.test`, emailConsent: true, createdAt: new Date(Date.now() - (300 - i) * 60_000) })) });
    const before = sent.length;
    const capOut = await processRelease(capRel.id, Date.now() + 120_000);
    const capSent = sent.slice(before).map((m) => m.to);
    check("Free plan emails the first 250 pre-savers, in order", capSent.length === 250 && capSent.includes(`cap0-${tag}@fans.test`) && !capSent.includes(`cap259-${tag}@fans.test`), `${capSent.length}`);
    check("the cap is noted and nothing else is sent on the next run", capOut.notes.some((n) => n.includes("plan limit")) && (await processRelease(capRel.id, Date.now() + 60_000)).emailed === 0);

    await prisma.organization.update({ where: { id: org.id }, data: { plan: "label" } });
    console.log("\n4. Pre-release store scans");
    const soon = await prisma.release.create({
      data: { organizationId: org.id, slug: `timing-soon-${tag}`, title: "Soon", artistName: "Tester", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() + 5 * 86400_000), upc: "701508333538", autoReResolve: true },
    });
    check("release 5 days out is queued for a store scan", (await findDueReleases()).some((r) => r.id === soon.id));
    await processRelease(soon.id, Date.now() + 60_000);
    const soon2 = await prisma.release.findUniqueOrThrow({ where: { id: soon.id } });
    check("scan is recorded and not repeated within the day", !!soon2.linksCheckedAt && !(await findDueReleases()).some((r) => r.id === soon.id));

    console.log("\n5. Refer a friend rewards (Stripe mocked)");
    check("a free month is 100% of a monthly bill or 1/12 of a yearly one", freeMonthPercent({ recurring: { interval: "month", interval_count: 1 } }) === 100 && freeMonthPercent({ recurring: { interval: "year", interval_count: 1 } }) === 8.33 && freeMonthPercent({ recurring: null }) === null);
    const DAYMS = 86_400_000;
    const subs: Record<string, { status: string; start_date: number; interval: string; discounts: unknown[] }> = {};
    const coupons: { id: string; percent_off: number; metadata: Record<string, string> }[] = [];
    const updates: { id: string; discounts: unknown[] }[] = [];
    const fakeStripe = {
      subscriptions: {
        retrieve: async (id: string) => {
          const x = subs[id];
          if (!x) throw new Error("No such subscription");
          return { id, status: x.status, start_date: x.start_date, discounts: x.discounts, items: { data: [{ price: { recurring: { interval: x.interval, interval_count: 1 } } }] } };
        },
        update: async (id: string, p: { discounts: { coupon?: string; discount?: string }[] }) => {
          updates.push({ id, discounts: p.discounts });
          subs[id].discounts = p.discounts.map((d) => (d.coupon ? { id: `di_${d.coupon}`, source: { coupon: coupons.find((c) => c.id === d.coupon) } } : { id: d.discount, source: { coupon: null } }));
          return {};
        },
      },
      invoices: { list: async ({ subscription }: { subscription: string }) => ({ data: subs[subscription] ? [{ amount_paid: 1200 }] : [] }) },
      coupons: { create: async (p: { percent_off: number; metadata: Record<string, string> }) => { const c = { id: `co_${coupons.length}`, ...p }; coupons.push(c); return c; } },
    } as never;
    const mk = async (name: string, sub?: { status?: string; days: number; interval?: string }) => {
      const o = await prisma.organization.create({ data: { name, slug: `timing-ref-${name}-${tag}`, plan: sub ? "artist" : "free", stripeSubscriptionId: sub ? `sub_${name}_${tag}` : null } });
      if (sub) subs[`sub_${name}_${tag}`] = { status: sub.status ?? "active", start_date: Math.floor((Date.now() - sub.days * DAYMS) / 1000), interval: sub.interval ?? "month", discounts: [] };
      refOrgs.push(o.id);
      return o;
    };
    const referrer = await mk("referrer", { days: 200 });
    const r1 = await mk("paid40", { days: 40 });
    const r2 = await mk("paid35", { days: 35 });
    const r3 = await mk("new10", { days: 10 });
    const r4 = await mk("free");
    for (const o of [r1, r2, r3, r4]) await prisma.referral.create({ data: { referrerOrgId: referrer.id, referredOrgId: o.id } });
    const run1 = await runReferralChecks({ stripe: fakeStripe });
    const rows1 = await prisma.referral.findMany({ where: { referrerOrgId: referrer.id } });
    const st = (id: string, rows: typeof rows1) => rows.find((r) => r.referredOrgId === id)?.status;
    check("30+ days paying earns; under 30 days or not subscribed stays pending", st(r3.id, rows1) === "pending" && st(r4.id, rows1) === "pending" && [st(r1.id, rows1), st(r2.id, rows1)].filter((x) => x === "applied" || x === "earned").length === 2, JSON.stringify(run1));
    check("only one free month goes on the next bill, at 100% for monthly", run1.applied === 1 && coupons.length === 1 && coupons[0].percent_off === 100 && updates.length === 1 && updates[0].id === `sub_referrer_${tag}`);
    await prisma.referral.updateMany({ where: { referrerOrgId: referrer.id }, data: { checkedAt: null } });
    const run2 = await runReferralChecks({ stripe: fakeStripe });
    check("the second month waits while the first is still unused", run2.applied === 0 && coupons.length === 1);
    subs[`sub_referrer_${tag}`].discounts = []; // invoice paid: the once-off discount is gone
    const run3 = await runReferralChecks({ stripe: fakeStripe });
    check("after the invoice, the next earned month is applied", run3.applied === 1 && coupons.length === 2);
    // Cap: 3 earned in 12 months, the 4th is capped.
    subs[`sub_new10_${tag}`].start_date = Math.floor((Date.now() - 45 * DAYMS) / 1000);
    const r5 = await mk("paid60", { days: 60 });
    await prisma.referral.create({ data: { referrerOrgId: referrer.id, referredOrgId: r5.id } });
    await prisma.referral.updateMany({ where: { referrerOrgId: referrer.id }, data: { checkedAt: null } });
    await runReferralChecks({ stripe: fakeStripe });
    const rows4 = await prisma.referral.findMany({ where: { referrerOrgId: referrer.id } });
    const earnedCount = rows4.filter((r) => r.status === "earned" || r.status === "applied").length;
    check("no more than 3 free months in 12 months; the rest are capped", earnedCount === 3 && rows4.filter((r) => r.status === "capped").length === 1, rows4.map((r) => r.status).join(","));
    // Free referrer: earned months wait until they subscribe; yearly subscribers get 1/12.
    const freeRef = await mk("freereferrer");
    const r6 = await mk("paid31", { days: 31 });
    await prisma.referral.create({ data: { referrerOrgId: freeRef.id, referredOrgId: r6.id } });
    await runReferralChecks({ stripe: fakeStripe });
    check("a referrer without a subscription keeps the month waiting", (await prisma.referral.findUnique({ where: { referredOrgId: r6.id } }))?.status === "earned");
    await prisma.organization.update({ where: { id: freeRef.id }, data: { stripeSubscriptionId: `sub_freereferrer_${tag}` } });
    subs[`sub_freereferrer_${tag}`] = { status: "active", start_date: Math.floor(Date.now() / 1000), interval: "year", discounts: [] };
    const before6 = coupons.length;
    await runReferralChecks({ stripe: fakeStripe });
    check("once they subscribe yearly, it's applied as 1/12 off", (await prisma.referral.findUnique({ where: { referredOrgId: r6.id } }))?.status === "applied" && coupons.length === before6 + 1 && coupons.at(-1)!.percent_off === 8.33);

    console.log("\n6. Push notifications (push service mocked)");
    const pushed: { endpoint: string; payload: { title: string; url: string } }[] = [];
    let failNext: number | null = null;
    setPushSenderForTests(async (sub, payload) => {
      if (failNext) { const code = failNext; failNext = null; throw Object.assign(new Error("gone"), { statusCode: code }); }
      pushed.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    });
    const pOrg = await prisma.organization.create({ data: { name: `Push ${tag}`, slug: `timing-push-${tag}`, plan: "label" } });
    refOrgs.push(pOrg.id);
    const owner = await prisma.user.create({ data: { email: `push-owner-${tag}@t.test`, passwordHash: "x", role: "owner", organizationId: pOrg.id } });
    const artistLogin = await prisma.user.create({ data: { email: `push-artist-${tag}@t.test`, passwordHash: "x", role: "artist", organizationId: pOrg.id } });
    const quiet = await prisma.user.create({ data: { email: `push-quiet-${tag}@t.test`, passwordHash: "x", role: "admin", organizationId: pOrg.id, pushPrefs: { milestones: false } } });
    for (const [u, n] of [[owner, "o"], [artistLogin, "a"], [quiet, "q"]] as const) await prisma.pushSubscription.create({ data: { userId: u.id, endpoint: `https://fcm.googleapis.com/fcm/send/${n}-${tag}`, p256dh: "B".repeat(87), auth: "A".repeat(22) } });
    const pRel = await prisma.release.create({ data: { organizationId: pOrg.id, artistId: artistLogin.id, slug: `timing-push-rel-${tag}`, title: "Push Song", artistName: "P", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() - 60_000) } });
    await prisma.preSave.createMany({ data: Array.from({ length: 24 }, (_, i) => ({ releaseId: pRel.id, platform: "email", email: `p${i}-${tag}@fans.test` })) });
    await notifyPresaveMilestone(pRel.id);
    check("no push before the first milestone (24 pre-saves)", pushed.length === 0);
    await prisma.preSave.create({ data: { releaseId: pRel.id, platform: "email", email: `p24-${tag}@fans.test` } });
    await Promise.all([notifyPresaveMilestone(pRel.id), notifyPresaveMilestone(pRel.id)]);
    const ms = pushed.filter((x) => x.payload.title.startsWith("25 pre-saves"));
    check("25th pre-save pushes once to owner and the release's artist; muted admin skipped", ms.length === 2 && ms.some((x) => x.endpoint.includes(`/o-${tag}`)) && ms.some((x) => x.endpoint.includes(`/a-${tag}`)) && !ms.some((x) => x.endpoint.includes(`/q-${tag}`)), `${ms.length}`);
    check("owners open the release, artist logins open their dashboard", ms.find((x) => x.endpoint.includes("/o-"))?.payload.url === `/admin/releases/${pRel.id}?tab=share` && ms.find((x) => x.endpoint.includes("/a-"))?.payload.url === "/dashboard");
    pushed.length = 0;
    await notifyLiveReleases(new Date(), true);
    await notifyLiveReleases(new Date(), true);
    check("'is out' pushes once per release (owner, admin, artist)", pushed.filter((x) => x.payload.title === "Push Song is out").length === 3, `${pushed.length}`);
    failNext = 410;
    await prisma.preSave.createMany({ data: Array.from({ length: 25 }, (_, i) => ({ releaseId: pRel.id, platform: "email", email: `pp${i}-${tag}@fans.test` })) });
    await notifyPresaveMilestone(pRel.id);
    check("a subscription the push service says is gone (410) is deleted", (await prisma.pushSubscription.count({ where: { user: { organizationId: pOrg.id } } })) === 2);
    setPushSenderForTests(null);
  } finally {
    await prisma.organization.deleteMany({ where: { id: { in: refOrgs } } }).catch(() => {});
    globalThis.fetch = realFetch;
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.$disconnect();
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
