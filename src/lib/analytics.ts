import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export type StatsRange = 14 | 30 | 90;

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

export async function getStats(releaseIds: string[], days: StatsRange = 30) {
  const since = new Date(Date.now() - days * 86400_000);
  const empty = { views: 0, clicks: 0, presaves: 0, emailClicks: 0, ctr: 0, conv: 0, byPlatform: [], bySource: [], byCountry: [], byArtist: [], daily: [] as { date: string; views: number; clicks: number; presaves: number }[] };
  if (!releaseIds.length) return empty;
  const inIds = { releaseId: { in: releaseIds } };
  const w = { ...inIds, createdAt: { gte: since } };

  const [views, clicks, presaves, emailClicks, platformRows, srcViews, srcClicks, srcPresaves, countryViews, countryClicks, artistClicks] = await Promise.all([
    prisma.pageView.count({ where: w }),
    prisma.clickEvent.count({ where: w }),
    prisma.preSave.count({ where: w }),
    prisma.clickEvent.count({ where: { ...w, convertedToPreSave: true } }),
    prisma.clickEvent.groupBy({ by: ["platform"], where: w, _count: { _all: true } }),
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

  const ids = Prisma.join(releaseIds);
  const bucket = Prisma.sql`to_char(date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Australia/Brisbane'), 'YYYY-MM-DD')`;
  const [dv, dc, dp] = await Promise.all([
    prisma.$queryRaw<{ d: string; n: bigint }[]>`SELECT ${bucket} AS d, COUNT(*)::bigint AS n FROM "PageView" WHERE "releaseId" IN (${ids}) AND "createdAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<{ d: string; n: bigint }[]>`SELECT ${bucket} AS d, COUNT(*)::bigint AS n FROM "ClickEvent" WHERE "releaseId" IN (${ids}) AND "createdAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<{ d: string; n: bigint }[]>`SELECT ${bucket} AS d, COUNT(*)::bigint AS n FROM "PreSave" WHERE "releaseId" IN (${ids}) AND "createdAt" >= ${since} GROUP BY 1`,
  ]);
  const daily: { date: string; views: number; clicks: number; presaves: number }[] = [];
  const idx = new Map<string, (typeof daily)[number]>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() + 10 * 3600_000 - i * 86400_000).toISOString().slice(0, 10);
    const row = { date: d, views: 0, clicks: 0, presaves: 0 };
    daily.push(row);
    idx.set(d, row);
  }
  dv.forEach((r) => idx.get(r.d) && (idx.get(r.d)!.views = Number(r.n)));
  dc.forEach((r) => idx.get(r.d) && (idx.get(r.d)!.clicks = Number(r.n)));
  dp.forEach((r) => idx.get(r.d) && (idx.get(r.d)!.presaves = Number(r.n)));

  return {
    views,
    clicks,
    presaves,
    emailClicks,
    ctr: views ? clicks / views : 0,
    conv: views ? presaves / views : 0,
    byPlatform: platformRows.map((r) => ({ platform: r.platform, clicks: r._count._all })).sort((a, b) => b.clicks - a.clicks),
    bySource: [...sourceMap.values()].sort((a, b) => b.views + b.clicks - (a.views + a.clicks)),
    byCountry: [...countryMap.values()].sort((a, b) => b.views - a.views).slice(0, 25),
    byArtist: [...artistMap.entries()].map(([artist, clicks]) => ({ artist, clicks })).sort((a, b) => b.clicks - a.clicks),
    daily,
  };
}

export type Stats = Awaited<ReturnType<typeof getStats>>;

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString() : v == null ? "" : String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // spreadsheet formula injection guard
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}
