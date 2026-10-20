/**
 * Bio page analytics.
 *
 * PageView and ClickEvent now hold rows for two different kinds of subject. The guarantee this
 * file exists to defend is that they never mix:
 *
 *   A bio page's rows must never be counted into a release's numbers, and a release's rows must
 *   never be counted into a bio page's.
 *
 * Nothing in the application says so out loud. It is true because every release query filters
 * `releaseId IN (...)` and SQL's IN never matches NULL, and every bio query filters
 * `bioPageId = ...`. That is a guarantee resting on a property of NULL, which is exactly the kind
 * of thing that survives until someone writes a reasonable-looking OR.
 *
 * Runs against the local database. Never point it at Neon.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
import { getStats, releaseTotals } from "../src/lib/analytics";
import { bioInsights, getBioStats } from "../src/lib/bio-stats";

for (const name of ["NETLIFY_DATABASE_URL", "DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  const raw = process.env[name];
  if (!raw) continue;
  let host = "";
  try { host = new URL(raw).hostname; } catch { host = raw; }
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

async function main() {
  console.log(`Bio analytics tests (run ${RUN})`);
  const org = await prisma.organization.create({
    data: { name: `Stats ${RUN}`, slug: `stats-${RUN}`, plan: "label", timezone: "Australia/Brisbane" },
  });
  const release = await prisma.release.create({
    data: { organizationId: org.id, slug: `stats-rel-${RUN}`, title: "Track", artistName: "Artist",
            coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() - 86400_000), rollout: "local" },
  });
  const page = await prisma.bioPage.create({
    data: { organizationId: org.id, slug: `stats-bio-${RUN}`, title: "Bio", imageUrl: "https://example.com/b.jpg", views: 500 },
  });
  // Two SoundCloud buttons on purpose: the thing per-link counting exists for.
  const linkA = await prisma.bioLink.create({ data: { bioPageId: page.id, platform: "soundcloud", label: "Mashup pack", url: "https://soundcloud.com/a", order: 0, clicks: 90 } });
  const linkB = await prisma.bioLink.create({ data: { bioPageId: page.id, platform: "soundcloud", label: "Edits", url: "https://soundcloud.com/b", order: 1, clicks: 10 } });

  try {
    // --- The constraint, not the convention -----------------------------------------
    let both = false;
    try {
      await prisma.pageView.create({ data: { releaseId: release.id, bioPageId: page.id } });
      both = true;
    } catch { /* expected */ }
    check("a view cannot belong to a release AND a bio page", !both,
      "two nullable keys with no CHECK is an invitation to double-count");

    let neither = false;
    try {
      await prisma.pageView.create({ data: {} });
      neither = true;
    } catch { /* expected */ }
    check("a view cannot belong to nothing at all", !neither);

    let orphanLink = false;
    try {
      await prisma.clickEvent.create({ data: { releaseId: release.id, platform: "spotify", bioLinkId: linkA.id } });
      orphanLink = true;
    } catch { /* expected */ }
    check("a release's click cannot carry a bio link id", !orphanLink);

    // --- Real rows, both kinds --------------------------------------------------------
    await prisma.pageView.createMany({ data: [
      { releaseId: release.id, source: "spotify", country: "US", deviceType: "desktop" },
      { releaseId: release.id, source: "spotify", country: "US", deviceType: "desktop" },
    ] });
    await prisma.clickEvent.createMany({ data: [
      { releaseId: release.id, platform: "spotify", source: "spotify", country: "US" },
    ] });
    await prisma.pageView.createMany({ data: [
      { bioPageId: page.id, source: "instagram", country: "AU", deviceType: "mobile" },
      { bioPageId: page.id, source: "instagram", country: "AU", deviceType: "mobile" },
      { bioPageId: page.id, source: "direct", country: "GB", deviceType: "mobile" },
    ] });
    await prisma.clickEvent.createMany({ data: [
      { bioPageId: page.id, bioLinkId: linkA.id, platform: "soundcloud", source: "instagram", country: "AU" },
      { bioPageId: page.id, bioLinkId: linkA.id, platform: "soundcloud", source: "instagram", country: "AU" },
      { bioPageId: page.id, bioLinkId: linkB.id, platform: "soundcloud", source: "direct", country: "GB" },
    ] });

    // --- The guarantee ----------------------------------------------------------------
    const rStats = await getStats([release.id], 30, org.timezone);
    check("a release's views do not include the bio page's", rStats.views === 2, String(rStats.views));
    check("a release's clicks do not include the bio page's", rStats.clicks === 1, String(rStats.clicks));
    check("a release's countries do not include the bio page's",
      rStats.byCountry.every((c) => c.country !== "AU" && c.country !== "GB"),
      rStats.byCountry.map((c) => c.country).join(","));
    check("a release's sources do not include the bio page's",
      rStats.bySource.every((s) => s.source !== "instagram"),
      rStats.bySource.map((s) => s.source).join(","));

    const totals = await releaseTotals([release.id]);
    check("the release totals map counts only the release", totals.get(release.id)?.views === 2);

    const bStats = await getBioStats(page.id, 30, org.timezone);
    check("a bio page's views do not include the release's", bStats.views === 3, String(bStats.views));
    check("a bio page's clicks do not include the release's", bStats.clicks === 3, String(bStats.clicks));
    check("a bio page's countries do not include the release's",
      bStats.byCountry.every((c) => c.country !== "US"), bStats.byCountry.map((c) => c.country).join(","));

    // --- What a bio page actually reports ---------------------------------------------
    check("the tap rate is taps over views", Math.abs(bStats.ctr - 1) < 1e-9, String(bStats.ctr));
    check("sources are ranked", bStats.bySource[0]?.source === "instagram", bStats.bySource.map((s) => s.source).join(","));
    check("countries carry a readable name", bStats.byCountry.some((c) => c.country === "AU" && c.name !== "AU"));
    check("devices are counted", bStats.byDevice[0]?.device === "mobile" && bStats.byDevice[0]?.views === 3);
    // The reason per-link counting exists: two buttons, same platform.
    check("two buttons on the same platform are counted apart",
      bStats.byLink.length === 2 && bStats.byLink[0].clicks === 2 && bStats.byLink[1].clicks === 1,
      JSON.stringify(bStats.byLink));
    check("each button keeps its own label",
      bStats.byLink[0].label !== bStats.byLink[1].label, JSON.stringify(bStats.byLink.map((l) => l.label)));
    check("the daily series covers the whole window", bStats.daily.length === 30);
    check("today's views land in the series", bStats.daily[bStats.daily.length - 1].views === 3);

    // --- Two numbers, two questions ----------------------------------------------------
    check("all-time views come from the counter, not the rows", bStats.allTimeViews === 500);
    check("all-time taps come from the counters", bStats.allTimeClicks === 100);
    check("the windowed number is smaller and that is expected", bStats.views < bStats.allTimeViews);

    // --- An empty page says so rather than showing zeros -------------------------------
    const quiet = await prisma.bioPage.create({
      data: { organizationId: org.id, slug: `stats-quiet-${RUN}`, title: "Quiet", imageUrl: "https://example.com/b.jpg" },
    });
    const qStats = await getBioStats(quiet.id, 30, org.timezone);
    check("a page with no visits reports that it has none", !qStats.hasEvents);
    check("…and does not invent insights", qStats.insights.length === 0);

    // --- Deleting a page takes its analytics, not its fans ------------------------------
    await prisma.pageView.create({ data: { bioPageId: quiet.id, source: "direct" } });
    await prisma.fanContact.create({ data: { organizationId: org.id, email: `keep-${RUN}@fans.dev`, consentSource: "bio", consentKind: "marketing", status: "mailable", importId: null, bioPageId: quiet.id } });
    await prisma.bioPage.delete({ where: { id: quiet.id } });
    check("deleting a page deletes its views", (await prisma.pageView.count({ where: { bioPageId: quiet.id } })) === 0);
    check("…but keeps the fans it collected",
      (await prisma.fanContact.count({ where: { organizationId: org.id, email: `keep-${RUN}@fans.dev` } })) === 1,
      "an address is the account's and outlives the page it arrived on");
  } finally {
    await prisma.organization.deleteMany({ where: { slug: `stats-${RUN}` } });
    await prisma.$disconnect();
  }

  // --- Insights stay quiet on ordinary input -------------------------------------------
  const none = { views: 0, clicks: 0, bySource: [], byCountry: [], byDevice: [], byLink: [] };
  check("no visits, nothing said", bioInsights(none).length === 0);
  check("under thirty visits, nothing said",
    bioInsights({ ...none, views: 29, clicks: 29, bySource: [{ source: "instagram", views: 29, clicks: 29 }] }).length === 0,
    "a panel that always has a sentence in it is a panel people stop reading");
  const even = bioInsights({
    views: 100, clicks: 50,
    bySource: [{ source: "a", views: 30, clicks: 15 }, { source: "b", views: 35, clicks: 20 }, { source: "c", views: 35, clicks: 15 }],
    byCountry: [{ country: "AU", name: "Australia", views: 34 }, { country: "GB", name: "United Kingdom", views: 33 }, { country: "US", name: "United States", views: 33 }],
    byDevice: [{ device: "mobile", views: 50 }, { device: "desktop", views: 50 }],
    byLink: [{ platform: "spotify", label: null, clicks: 20 }, { platform: "soundcloud", label: null, clicks: 30 }],
  });
  check("an even spread produces no claims", even.length === 0, JSON.stringify(even.map((i) => i.title)));

  const lopsided = bioInsights({
    views: 100, clicks: 10,
    bySource: [{ source: "instagram", views: 80, clicks: 8 }, { source: "direct", views: 20, clicks: 2 }],
    byCountry: [{ country: "AU", name: "Australia", views: 90 }],
    byDevice: [{ device: "mobile", views: 95 }, { device: "desktop", views: 5 }],
    byLink: [{ platform: "soundcloud", label: "Mashup pack", clicks: 9 }],
  });
  const titles = lopsided.map((i) => i.title).join(" | ");
  check("a dominant source is named", /instagram/i.test(titles), titles);
  check("a dominant country is named", /Australia/i.test(titles), titles);
  check("a phone-only audience is named", /phone/i.test(titles), titles);
  check("a low tap rate is named", /without a tap/i.test(titles), titles);
  // Every sentence is shown to the account holder. None of them may be a bare number with no
  // subject, and none may claim something the data cannot support.
  check("every insight has a title and a body", lopsided.every((i) => i.title.length > 3 && i.body.length > 10));

  // --- the public disclosure already covered this, and has to keep covering it ----------
  //
  // No privacy change was needed for bio analytics, which is worth recording rather than
  // assuming: "Page and click analytics" already described exactly these fields, and the policy
  // already names a bio page as a surface a fan visits. The old behaviour -- a single counter --
  // collected LESS than droplr said it did. These checks exist so that stays true in the
  // direction that matters, not so someone trusts a memory of it.
  const privacy = readFileSync(join(import.meta.dirname, "..", "src/app/legal/privacy/page.tsx"), "utf8");
  check("the policy names a bio page as somewhere a fan is tracked", /visit a smart link, pre-save page or bio page/i.test(privacy));
  check("…and discloses which page and button", /which page and button you used/i.test(privacy));
  check("…and the country, device and referrer", /country[\s\S]{0,300}device type[\s\S]{0,200}referring website/i.test(privacy));
  check("…and the visitor id cookie", /random visitor ID stored in a cookie/i.test(privacy));
  check("…and that the raw IP is never stored", /one-way hash of it/i.test(privacy));

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
