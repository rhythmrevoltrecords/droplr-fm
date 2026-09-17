import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { labelDuplicateLinks } from "./link-labels";
import { DEFAULT_TZ, isValidTimeZone, zonedDay } from "./time";

export type StatsRange = 14 | 30 | 90 | 365;

/** Parse ?days= and clamp it to the plan's analytics history. */
export function statsRange(raw: string | undefined, maxDays: number): StatsRange {
  const n = Number(raw);
  const want = ([14, 30, 90, 365] as const).find((d) => d === n) ?? 30;
  const allowed = ([365, 90, 30, 14] as const).find((d) => d <= maxDays && d <= want) ?? 14;
  return allowed;
}

export async function releaseTotals(releaseIds: string[]) {
  if (!releaseIds.length) return new Map<string, { views: number; clicks: number; presaves: number }>();
  const [views, clicks, presaves] = await Promise.all([
    prisma.pageView.groupBy({ by: ["releaseId"], where: { releaseId: { in: releaseIds } }, _count: { _all: true } }),
    prisma.clickEvent.groupBy({ by: ["releaseId"], where: { releaseId: { in: releaseIds } }, _count: { _all: true } }),
    prisma.preSave.groupBy({ by: ["releaseId"], where: { releaseId: { in: releaseIds } }, _count: { _all: true } }),
  ]);
  const map = new Map<string, { views: number; clicks: number; presaves: number }>();
  for (const id of releaseIds) map.set(id, { views: 0, clicks: 0, presaves: 0 });
  views.forEach((v) => (map.get(v.releaseId)!.views = v._count._all));
  clicks.forEach((v) => (map.get(v.releaseId)!.clicks = v._count._all));
  presaves.forEach((v) => (map.get(v.releaseId)!.presaves = v._count._all));
  return map;
}

export async function getStats(releaseIds: string[], days: StatsRange = 30, timeZone: string = DEFAULT_TZ) {
  const tz = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TZ;
  const since = new Date(Date.now() - days * 86400_000);
  const empty = {
    views: 0, clicks: 0, presaves: 0, emailClicks: 0, ctr: 0, conv: 0, byPlatform: [], byLink: [] as { key: string; platform: string; label: string | null; clicks: number }[], bySource: [], byCountry: [], byArtist: [],
    daily: [] as { date: string; views: number; clicks: number; presaves: number }[],
    heat: { views: emptyGrid(), presaves: emptyGrid() }, byDevice: [] as { device: string; views: number }[], byListenOn: [] as { platform: string; presaves: number }[], insights: [] as Insight[],
  };
  if (!releaseIds.length) return empty;
  const inIds = { releaseId: { in: releaseIds } };
  const w = { ...inIds, createdAt: { gte: since } };

  const [views, clicks, presaves, emailClicks, platformRows, srcViews, srcClicks, srcPresaves, countryViews, countryClicks, artistClicks] = await Promise.all([
    prisma.pageView.count({ where: w }),
    prisma.clickEvent.count({ where: w }),
    prisma.preSave.count({ where: w }),
    prisma.clickEvent.count({ where: { ...w, convertedToPreSave: true } }),
    prisma.clickEvent.groupBy({ by: ["platform", "linkId"], where: w, _count: { _all: true } }),
    prisma.pageView.groupBy({ by: ["source"], where: w, _count: { _all: true } }),
    prisma.clickEvent.groupBy({ by: ["source"], where: w, _count: { _all: true } }),
    prisma.preSave.groupBy({ by: ["source"], where: w, _count: { _all: true } }),
    prisma.pageView.groupBy({ by: ["country"], where: w, _count: { _all: true } }),
    prisma.clickEvent.groupBy({ by: ["country"], where: w, _count: { _all: true } }),
    prisma.clickEvent.groupBy({ by: ["releaseId"], where: w, _count: { _all: true } }),
  ]);

  const sourceMap = new Map<string, { source: string; views: number; clicks: number; presaves: number }>();
  const src = (s: string | null) => {
    const k = s ?? "direct";
    if (!sourceMap.has(k)) sourceMap.set(k, { source: k, views: 0, clicks: 0, presaves: 0 });
    return sourceMap.get(k)!;
  };
  srcViews.forEach((r) => (src(r.source).views += r._count._all));
  srcClicks.forEach((r) => (src(r.source).clicks += r._count._all));
  srcPresaves.forEach((r) => (src(r.source).presaves += r._count._all));

  const countryMap = new Map<string, { country: string; views: number; clicks: number }>();
  const ctry = (c: string | null) => {
    const k = c ?? "Unknown";
    if (!countryMap.has(k)) countryMap.set(k, { country: k, views: 0, clicks: 0 });
    return countryMap.get(k)!;
  };
  countryViews.forEach((r) => (ctry(r.country).views += r._count._all));
  countryClicks.forEach((r) => (ctry(r.country).clicks += r._count._all));

  // Label roll-up: which artist drives the most clicks
  const rels = await prisma.release.findMany({ where: { id: { in: releaseIds } }, select: { id: true, artistName: true } });
  const artistOf = new Map(rels.map((r) => [r.id, r.artistName]));
  const artistMap = new Map<string, number>();
  artistClicks.forEach((r) => {
    const a = artistOf.get(r.releaseId) ?? "Unknown";
    artistMap.set(a, (artistMap.get(a) ?? 0) + r._count._all);
  });

  // Clicks per platform (roster-level) and per individual button (so two SoundCloud links count separately)
  const platformMap = new Map<string, number>();
  platformRows.forEach((r) => platformMap.set(r.platform, (platformMap.get(r.platform) ?? 0) + r._count._all));
  const byPlatform = [...platformMap.entries()].map(([platform, clicks]) => ({ platform, clicks })).sort((a, b) => b.clicks - a.clicks);
  const linkRows = await prisma.releaseLink.findMany({ where: { releaseId: { in: releaseIds } }, orderBy: [{ releaseId: "asc" }, { position: "asc" }] });
  const labelById = new Map<string, string | null>();
  for (const rid of releaseIds) labelDuplicateLinks(linkRows.filter((l) => l.releaseId === rid)).forEach((l) => labelById.set(l.id, l.label));
  const byLink = platformRows
    .map((r) => ({ key: r.linkId ?? `platform:${r.platform}`, platform: r.platform, label: r.linkId ? labelById.get(r.linkId) ?? null : null, clicks: r._count._all }))
    .sort((a, b) => b.clicks - a.clicks);

  const ids = Prisma.join(releaseIds);
  const bucket = Prisma.sql`to_char(date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD')`;
  const [dv, dc, dp] = await Promise.all([
    prisma.$queryRaw<{ d: string; n: bigint }[]>`SELECT ${bucket} AS d, COUNT(*)::bigint AS n FROM "PageView" WHERE "releaseId" IN (${ids}) AND "createdAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<{ d: string; n: bigint }[]>`SELECT ${bucket} AS d, COUNT(*)::bigint AS n FROM "ClickEvent" WHERE "releaseId" IN (${ids}) AND "createdAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<{ d: string; n: bigint }[]>`SELECT ${bucket} AS d, COUNT(*)::bigint AS n FROM "PreSave" WHERE "releaseId" IN (${ids}) AND "createdAt" >= ${since} GROUP BY 1`,
  ]);
  const daily: { date: string; views: number; clicks: number; presaves: number }[] = [];
  const idx = new Map<string, (typeof daily)[number]>();
  for (let i = days - 1; i >= 0; i--) {
    const d = zonedDay(new Date(Date.now() - i * 86400_000), tz);
    const row = { date: d, views: 0, clicks: 0, presaves: 0 };
    daily.push(row);
    idx.set(d, row);
  }
  dv.forEach((r) => idx.get(r.d) && (idx.get(r.d)!.views = Number(r.n)));
  dc.forEach((r) => idx.get(r.d) && (idx.get(r.d)!.clicks = Number(r.n)));
  dp.forEach((r) => idx.get(r.d) && (idx.get(r.d)!.presaves = Number(r.n)));

  // --- Insights: when fans are active (their own clock), devices, chosen stores, plain-English patterns ---
  const [heatViews, heatPresaves, deviceRows, listenRows] = await Promise.all([
    activityGrid("PageView", releaseIds, since, tz),
    activityGrid("PreSave", releaseIds, since, tz),
    prisma.pageView.groupBy({ by: ["deviceType"], where: w, _count: { _all: true } }),
    prisma.preSave.groupBy({ by: ["listenOn"], where: { ...w, listenOn: { not: null } }, _count: { _all: true } }),
  ]);
  const byDevice = deviceRows.map((r) => ({ device: r.deviceType ?? "unknown", views: r._count._all })).sort((a, b) => b.views - a.views);
  const byListenOn = listenRows.map((r) => ({ platform: r.listenOn!, presaves: r._count._all })).sort((a, b) => b.presaves - a.presaves);
  const bySourceList = [...sourceMap.values()].sort((a, b) => b.views + b.clicks - (a.views + a.clicks));
  const byCountryList = [...countryMap.values()].sort((a, b) => b.views - a.views);

  return {
    heat: { views: heatViews, presaves: heatPresaves },
    byDevice,
    byListenOn,
    insights: buildInsights({ views, clicks, presaves, heat: heatViews, byDevice, byListenOn, bySource: bySourceList, byCountry: byCountryList }),
    views,
    clicks,
    presaves,
    emailClicks,
    ctr: views ? clicks / views : 0,
    conv: views ? presaves / views : 0,
    byPlatform,
    byLink,
    bySource: bySourceList,
    byCountry: byCountryList.slice(0, 25),
    byArtist: [...artistMap.entries()].map(([artist, clicks]) => ({ artist, clicks })).sort((a, b) => b.clicks - a.clicks),
    daily,
  };
}

export type Stats = Awaited<ReturnType<typeof getStats>>;

// --- Activity grid (day of week × hour, in each visitor's own timezone) ---------------------------------------------

/** grid[dow 0=Sun][hour 0-23] */
export type Grid = number[][];
export type Insight = { title: string; body: string };
const emptyGrid = (): Grid => Array.from({ length: 7 }, () => Array<number>(24).fill(0));

async function activityGrid(table: "PageView" | "PreSave", releaseIds: string[], since: Date, labelTz: string): Promise<Grid> {
  const grid = emptyGrid();
  const ids = Prisma.join(releaseIds);
  const t = Prisma.raw(`"${table}"`);
  // Rows without a visitor timezone (older data, no geo) use the label's timezone.
  const direct = () => prisma.$queryRaw<{ dow: number; h: number; n: bigint }[]>`
    SELECT EXTRACT(DOW FROM l)::int AS dow, EXTRACT(HOUR FROM l)::int AS h, COUNT(*)::bigint AS n
    FROM (SELECT ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE COALESCE("timezone", ${labelTz}) AS l FROM ${t} WHERE "releaseId" IN (${ids}) AND "createdAt" >= ${since}) s
    GROUP BY 1, 2`;
  // Fallback if Postgres doesn't know a stored zone name: only use names it has.
  const safe = () => prisma.$queryRaw<{ dow: number; h: number; n: bigint }[]>`
    WITH z AS (SELECT name FROM pg_timezone_names)
    SELECT EXTRACT(DOW FROM l)::int AS dow, EXTRACT(HOUR FROM l)::int AS h, COUNT(*)::bigint AS n
    FROM (SELECT (x."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(z.name, ${labelTz}) AS l FROM ${t} x LEFT JOIN z ON z.name = x."timezone" WHERE x."releaseId" IN (${ids}) AND x."createdAt" >= ${since}) s
    GROUP BY 1, 2`;
  const rows = await direct().catch(() => safe());
  for (const r of rows) if (grid[r.dow] && r.h >= 0 && r.h < 24) grid[r.dow][r.h] = Number(r.n);
  return grid;
}

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The hour fans are most active across an account's releases (last 90 days, fan-local time), if there's enough data. */
export async function busiestHour(releaseIds: string[], labelTz: string) {
  if (!releaseIds.length) return null;
  const grid = await activityGrid("PageView", releaseIds, new Date(Date.now() - 90 * 86_400_000), isValidTimeZone(labelTz) ? labelTz : DEFAULT_TZ);
  const total = grid.flat().reduce((a, b) => a + b, 0);
  if (total < 50) return null;
  // Hour of day summed over the week, smoothed with its neighbours.
  const hours = Array.from({ length: 24 }, (_, h) => grid.reduce((a, row) => a + row[h], 0));
  let best = 0;
  let bestScore = -1;
  for (let h = 0; h < 24; h++) {
    const score = hours[(h + 23) % 24] + hours[h] * 2 + hours[(h + 1) % 24];
    if (score > bestScore) [best, bestScore] = [h, score];
  }
  const days = grid.map((row, d) => ({ d, n: row.reduce((a, b) => a + b, 0) })).sort((a, b) => b.n - a.n);
  return { hour: best, label: hourLabel(best), topDay: DAY_NAMES[days[0].d] };
}
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
const share = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export function countryName(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Plain-English patterns, only when there's enough data to mean something. */
function buildInsights(d: {
  views: number; clicks: number; presaves: number; heat: Grid;
  byDevice: { device: string; views: number }[]; byListenOn: { platform: string; presaves: number }[];
  bySource: { source: string; views: number; clicks: number; presaves: number }[]; byCountry: { country: string; views: number }[];
}): Insight[] {
  const out: Insight[] = [];
  if (d.views < 30) return out;

  // Busiest 3-hour window across the week (wraps past midnight into the next day).
  const flat = d.heat.flat();
  let best = { start: 0, total: -1 };
  for (let i = 0; i < 168; i++) {
    const total = flat[i] + flat[(i + 1) % 168] + flat[(i + 2) % 168];
    if (total > best.total) best = { start: i, total };
  }
  // Only worth saying if that window clearly beats an even spread (3 of 168 hours ≈ 1.8%).
  if (best.total > 0 && best.total / d.views >= (3 / 168) * 1.6) {
    const day = Math.floor(best.start / 24);
    const hour = best.start % 24;
    out.push({
      title: `Busiest: ${DAY_NAMES[day]} ${hourLabel(hour)}–${hourLabel((hour + 3) % 24)}`,
      body: `${share(best.total, d.views)}% of page views land in this 3-hour window, in each fan's own timezone. Post and send stories just before it.`,
    });
  }

  // Weekend vs weekday, per day.
  const dayTotals = d.heat.map((row) => row.reduce((a, b) => a + b, 0));
  const weekend = (dayTotals[0] + dayTotals[6]) / 2;
  const weekday = (dayTotals[1] + dayTotals[2] + dayTotals[3] + dayTotals[4] + dayTotals[5]) / 5;
  if (weekday > 0 && weekend > 0) {
    const ratio = weekend / weekday;
    if (ratio >= 1.25) out.push({ title: `Weekends are ${Math.round((ratio - 1) * 100)}% busier`, body: "An average Saturday or Sunday gets more views than an average weekday. Save your biggest posts for the weekend." });
    else if (ratio <= 0.8) out.push({ title: `Weekdays are ${Math.round((1 / ratio - 1) * 100)}% busier`, body: "Fans check links more on weekdays than weekends. Lead with a weekday post; keep weekends for reminders." });
  }

  const mobile = d.byDevice.find((x) => x.device === "mobile")?.views ?? 0;
  const mobileShare = share(mobile, d.views);
  if (mobileShare >= 70) out.push({ title: `${mobileShare}% of fans are on their phone`, body: "Design posts and stories for vertical screens, and keep the link in your bio and story stickers." });
  else if (mobileShare > 0 && mobileShare <= 40) out.push({ title: `Only ${mobileShare}% on mobile`, body: "Most visits come from desktop: blogs, newsletters, DJ forums or Discord are likely driving traffic more than Instagram." });

  // Source that converts best (clicks + pre-saves per view) vs the average.
  const overall = (d.clicks + d.presaves) / d.views;
  const strong = d.bySource.filter((s) => s.views >= 20).map((s) => ({ ...s, rate: (s.clicks + s.presaves) / s.views })).sort((a, b) => b.rate - a.rate)[0];
  if (strong && overall > 0 && strong.rate >= overall * 1.5) {
    const src = strong.source === "x" ? "X" : strong.source.charAt(0).toUpperCase() + strong.source.slice(1);
    out.push({ title: `${src} visitors act ${(strong.rate / overall).toFixed(1)}× more`, body: `People arriving from ${src} click or pre-save far more than average. Put more of your promo there.` });
  }

  const picked = d.byListenOn.reduce((a, b) => a + b.presaves, 0);
  if (picked >= 10 && d.byListenOn[0]) {
    const top = d.byListenOn[0];
    const name = top.platform === "appleMusic" ? "Apple Music" : top.platform === "youtubeMusic" ? "YouTube Music" : top.platform === "amazonMusic" ? "Amazon Music" : top.platform.charAt(0).toUpperCase() + top.platform.slice(1);
    out.push({ title: `${share(top.presaves, picked)}% of pre-savers listen on ${name}`, body: `When fans choose a store, ${name} leads. Make sure that link is on the page before release day.` });
  }

  const topCountry = d.byCountry.find((c) => c.country !== "Unknown");
  if (topCountry && share(topCountry.views, d.views) >= 40) {
    out.push({ title: `${share(topCountry.views, d.views)}% of views are from ${countryName(topCountry.country)}`, body: "Your audience is concentrated there. Time posts to that country's evening and consider local playlists, blogs and gigs." });
  }
  return out.slice(0, 5);
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString() : v == null ? "" : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // spreadsheet formula injection guard (tab/CR too)
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}
