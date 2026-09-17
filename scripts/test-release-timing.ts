/**
 * Release timing + fan platform choice, against the local database (no server needed; Resend/Spotify/stores are mocked).
 *   npx tsx scripts/test-release-timing.ts
 * Checks: per-timezone unlock maths, emails only go to fans whose local moment has come, fans who picked a store
 * with no link wait, their pick leads the email, overlapping runs can't double-send, pre-release store scans are queued.
 */
import { prisma } from "../src/lib/db";
import { findDueReleases, processRelease } from "../src/lib/presave-processor";
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

    console.log("\n3. Pre-release store scans");
    const soon = await prisma.release.create({
      data: { organizationId: org.id, slug: `timing-soon-${tag}`, title: "Soon", artistName: "Tester", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() + 5 * 86400_000), upc: "701508333538", autoReResolve: true },
    });
    check("release 5 days out is queued for a store scan", (await findDueReleases()).some((r) => r.id === soon.id));
    await processRelease(soon.id, Date.now() + 60_000);
    const soon2 = await prisma.release.findUniqueOrThrow({ where: { id: soon.id } });
    check("scan is recorded and not repeated within the day", !!soon2.linksCheckedAt && !(await findDueReleases()).some((r) => r.id === soon.id));
  } finally {
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
