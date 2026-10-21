import { SOCIAL_LABELS, type SocialKey } from "./artist-fields";
import { ICON_PLATFORM_PREFIX } from "./bio-socials";
import { Prisma } from "@prisma/client";
import { activityGrid, countryName, type Grid, type Insight, type StatsRange } from "./analytics";
import { prisma } from "./db";
import { labelDuplicateLinks } from "./link-labels";
import { DEFAULT_TZ, isValidTimeZone, zonedDay } from "./time";

/**
 * What a bio page can honestly say about its own visitors.
 *
 * It reads PageView and ClickEvent -- the SAME tables a release page reads, since the 20 Oct
 * migration -- but it is deliberately NOT getStats with a flag. Six of what getStats returns are
 * release concepts: pre-saves, conversion rate, chosen store, by-artist, release link labels,
 * and the email-click column. A bio page has none of them, and handing it a struct where half
 * the fields are structurally zero is how a dashboard starts lying quietly.
 *
 * Shared tables, shared timezone handling (activityGrid), separate questions.
 *
 * TWO NUMBERS THAT ARE BOTH RIGHT. `allTimeViews` comes from BioPage.views, an integer that has
 * been counting since bio pages existed. `views` comes from PageView rows, which only start on
 * the day this shipped. They will not agree on an old page and they are not meant to: one is
 * "ever", the other is "in the last N days, and here is where they came from". The screen says
 * which is which, because a number whose question is unclear is worse than no number.
 */
export type BioStats = {
  /** Windowed, from PageView rows. */
  views: number;
  /** Windowed, from ClickEvent rows. */
  clicks: number;
  ctr: number;
  /** All-time, from the counters. Includes everything from before this table covered bio pages. */
  allTimeViews: number;
  allTimeClicks: number;
  /** True once there is any event row at all — until then the windowed panels have nothing to say. */
  hasEvents: boolean;
  bySource: { source: string; views: number; clicks: number }[];
  byCountry: { country: string; name: string; views: number; clicks: number }[];
  byDevice: { device: string; views: number }[];
  byLink: { id: string; platform: string; label: string | null; clicks: number }[];
  daily: { date: string; views: number; clicks: number }[];
  heat: Grid;
  insights: Insight[];
};

/** Bio rows only. A release's rows have a NULL bioPageId, so `=` cannot catch one. */
export const bioSubject = (bioPageId: string) => Prisma.sql`"bioPageId" = ${bioPageId}`;

export async function getBioStats(bioPageId: string, days: StatsRange = 30, timeZone: string = DEFAULT_TZ): Promise<BioStats> {
  const tz = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TZ;
  const since = new Date(Date.now() - days * 86400_000);
  const w = { bioPageId, createdAt: { gte: since } };

  const [page, links, views, clicks, srcViews, srcClicks, ctryViews, ctryClicks, deviceRows, linkRows, iconRows] = await Promise.all([
    prisma.bioPage.findUnique({ where: { id: bioPageId }, select: { views: true } }),
    prisma.bioLink.findMany({ where: { bioPageId }, orderBy: { order: "asc" } }),
    prisma.pageView.count({ where: w }),
    prisma.clickEvent.count({ where: w }),
    prisma.pageView.groupBy({ by: ["source"], where: w, _count: { _all: true } }),
    prisma.clickEvent.groupBy({ by: ["source"], where: w, _count: { _all: true } }),
    prisma.pageView.groupBy({ by: ["country"], where: w, _count: { _all: true } }),
    prisma.clickEvent.groupBy({ by: ["country"], where: w, _count: { _all: true } }),
    prisma.pageView.groupBy({ by: ["deviceType"], where: w, _count: { _all: true } }),
    prisma.clickEvent.groupBy({ by: ["bioLinkId"], where: w, _count: { _all: true } }),
    // Social icon taps have no BioLink row (lib/bio-socials), so they are told apart by platform.
    prisma.clickEvent.groupBy({ by: ["platform"], where: { ...w, bioLinkId: null, platform: { startsWith: ICON_PLATFORM_PREFIX } }, _count: { _all: true } }),
  ]);

  const sourceMap = new Map<string, { source: string; views: number; clicks: number }>();
  const src = (s: string | null) => {
    const k = s ?? "direct";
    if (!sourceMap.has(k)) sourceMap.set(k, { source: k, views: 0, clicks: 0 });
    return sourceMap.get(k)!;
  };
  srcViews.forEach((r) => (src(r.source).views += r._count._all));
  srcClicks.forEach((r) => (src(r.source).clicks += r._count._all));

  const countryMap = new Map<string, { country: string; name: string; views: number; clicks: number }>();
  const ctry = (c: string | null) => {
    const k = c ?? "Unknown";
    if (!countryMap.has(k)) countryMap.set(k, { country: k, name: k === "Unknown" ? "Unknown" : countryName(k), views: 0, clicks: 0 });
    return countryMap.get(k)!;
  };
  ctryViews.forEach((r) => (ctry(r.country).views += r._count._all));
  ctryClicks.forEach((r) => (ctry(r.country).clicks += r._count._all));

  // Two buttons can be the same platform (three SoundCloud links on a mashup pack), so the label
  // comes from the same disambiguator the public page uses rather than from the platform name.
  const labelled = labelDuplicateLinks(links.map((l) => ({ ...l, title: l.label })));
  const labelById = new Map(labelled.map((l) => [l.id, l.label]));
  const platformById = new Map(links.map((l) => [l.id, l.platform]));
  const byLink = linkRows
    .filter((r): r is typeof r & { bioLinkId: string } => !!r.bioLinkId)
    .map((r) => ({
      id: r.bioLinkId,
      platform: platformById.get(r.bioLinkId) ?? "link",
      label: labelById.get(r.bioLinkId) ?? null,
      clicks: r._count._all,
    }))
    .concat(iconRows.map((r) => {
      const key = r.platform.slice(ICON_PLATFORM_PREFIX.length);
      return { id: r.platform, platform: key, label: `${SOCIAL_LABELS[key as SocialKey] ?? key} icon`, clicks: r._count._all };
    }))
    .sort((a, b) => b.clicks - a.clicks);

  const bucket = Prisma.sql`to_char(date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD')`;
  const [dv, dc, heat] = await Promise.all([
    prisma.$queryRaw<{ d: string; n: bigint }[]>`SELECT ${bucket} AS d, COUNT(*)::bigint AS n FROM "PageView" WHERE "bioPageId" = ${bioPageId} AND "createdAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<{ d: string; n: bigint }[]>`SELECT ${bucket} AS d, COUNT(*)::bigint AS n FROM "ClickEvent" WHERE "bioPageId" = ${bioPageId} AND "createdAt" >= ${since} GROUP BY 1`,
    activityGrid("PageView", bioSubject(bioPageId), since, tz),
  ]);
  const daily: { date: string; views: number; clicks: number }[] = [];
  const idx = new Map<string, (typeof daily)[number]>();
  for (let i = days - 1; i >= 0; i--) {
    const d = zonedDay(new Date(Date.now() - i * 86400_000), tz);
    const row = { date: d, views: 0, clicks: 0 };
    daily.push(row);
    idx.set(d, row);
  }
  dv.forEach((r) => idx.get(r.d) && (idx.get(r.d)!.views = Number(r.n)));
  dc.forEach((r) => idx.get(r.d) && (idx.get(r.d)!.clicks = Number(r.n)));

  const byDevice = deviceRows.map((r) => ({ device: r.deviceType ?? "unknown", views: r._count._all })).sort((a, b) => b.views - a.views);
  const bySource = [...sourceMap.values()].sort((a, b) => b.views + b.clicks - (a.views + a.clicks));
  const byCountry = [...countryMap.values()].sort((a, b) => b.views - a.views).slice(0, 25);

  return {
    views,
    clicks,
    ctr: views ? clicks / views : 0,
    allTimeViews: page?.views ?? 0,
    allTimeClicks: links.reduce((n, l) => n + l.clicks, 0),
    hasEvents: views > 0 || clicks > 0,
    bySource,
    byCountry,
    byDevice,
    byLink,
    daily,
    heat,
    insights: bioInsights({ views, clicks, bySource, byCountry, byDevice, byLink }),
  };
}

/**
 * Plain-English patterns, and silence when there is nothing worth saying.
 *
 * Every rule here has a floor. A panel that always has a sentence in it is a panel people stop
 * reading, and "not enough visits yet to tell" is a real answer that belongs in the UI rather
 * than a confident claim built on nine data points.
 */
export function bioInsights(s: {
  views: number;
  clicks: number;
  bySource: { source: string; views: number; clicks: number }[];
  byCountry: { country: string; name: string; views: number }[];
  byDevice: { device: string; views: number }[];
  byLink: { platform: string; label: string | null; clicks: number }[];
}): Insight[] {
  const out: Insight[] = [];
  if (s.views < 30) return out;

  const top = s.bySource[0];
  if (top && top.views >= 10) {
    const share = Math.round((top.views / s.views) * 100);
    if (share >= 40) {
      out.push({
        title: top.source === "direct" ? "Most people type it in or tap it in a bio" : `Most people arrive from ${top.source}`,
        body: top.source === "direct"
          ? `${share}% of visits have no referrer, which is what a tap from an app's bio field looks like.`
          : `${share}% of visits come from ${top.source}. It is worth knowing which post, not just which app.`,
      });
    }
  }

  const country = s.byCountry[0];
  if (country && country.views >= 10) {
    const share = Math.round((country.views / s.views) * 100);
    if (share >= 50 && country.country !== "Unknown") {
      out.push({ title: `${country.name} is where your page is opened`, body: `${share}% of visits. Worth checking your release times against that, not your own clock.` });
    }
  }

  const mobile = s.byDevice.find((d) => d.device === "mobile")?.views ?? 0;
  if (mobile) {
    const share = Math.round((mobile / s.views) * 100);
    if (share >= 80) out.push({ title: "This is a phone page", body: `${share}% of visits are on a phone. Check it on one before you change it.` });
  }

  if (s.views >= 50) {
    const ctr = s.clicks / s.views;
    if (ctr < 0.2) out.push({ title: "Most visits end without a tap", body: `${Math.round(ctr * 100)}% of visits tap something. Either the top of the page is not saying what this is, or there are too many buttons to choose from.` });
  }

  const best = s.byLink[0];
  if (best && s.clicks >= 20 && best.clicks / s.clicks >= 0.5) {
    out.push({ title: `${best.label ?? best.platform} takes half the taps`, body: "Everything below it is being scrolled past. Worth moving it, or cutting the ones nobody uses." });
  }
  return out;
}
