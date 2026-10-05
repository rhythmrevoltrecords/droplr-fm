import { prisma } from "./db";

/**
 * Platform-wide totals, for the question "how big is droplr?" — asked by a partner, a distributor,
 * or anyone being pitched.
 *
 * **Every number here is derived from `createdAt` on rows that already exist.** There is no counter
 * table and nothing new is written. That matters more than it sounds: a counters table would only
 * start counting from the day it shipped, throwing away every month before it, and it would be one
 * more thing that can drift from the truth. A `COUNT(*)` with a date filter cannot drift.
 *
 * **It also means the history is honest in the other direction** — delete an account and its rows go
 * with it, so these are current facts rather than a high-water mark nobody can audit.
 */

/**
 * Organisations that are ours rather than customers'. Comma-separated slugs, e.g.
 * `PLATFORM_INTERNAL_ORG_SLUGS="rhythm-revolt-records,ototo"`.
 *
 * This exists because the single fastest way to lose a partner conversation is to quote a number
 * they later discover is mostly you. Every figure below is reported twice: everything, and
 * everything minus these. The headline on the page is the second one.
 */
export function internalSlugs(): string[] {
  return (process.env.PLATFORM_INTERNAL_ORG_SLUGS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export type Totals = {
  /** Releases — each one is a public smart link / pre-save page. */
  smartLinks: number;
  /** Bio pages. Counted apart from releases because they are a different thing people made. */
  bioPages: number;
  /** smartLinks + bioPages. The "links created" headline. */
  links: number;
  /** Distinct email addresses across pre-saves and imported contacts. One person, one fan. */
  uniqueFans: number;
  /** Pre-save actions. Repeats count. Engagement, not audience — never label this "fans". */
  presaves: number;
  /** Artist roster profiles created by labels. */
  artistProfiles: number;
  /** Accounts whose own plan kind is "artist". */
  artistAccounts: number;
  /** Accounts whose own plan kind is "label". */
  labelAccounts: number;
  /** Logins, across every account. */
  logins: number;
  /** Clicks out to a store, ever. */
  clicks: number;
};

export type MonthRow = { month: string; links: number; fans: number; accounts: number };

export type PlatformStats = {
  all: Totals;
  /** Customers only — internal orgs removed. This is the number to quote. */
  external: Totals;
  /** Last 12 complete months plus the current one, customers only, oldest first. */
  months: MonthRow[];
  /** Slugs excluded from `external`, so the page can say so out loud. */
  excluded: string[];
  /** When the first customer account was created — "live since". */
  firstAccountAt: Date | null;
  generatedAt: Date;
};

/** YYYY-MM in UTC. Month boundaries in one timezone, so two runs never disagree. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The last `n` month keys ending with the month `now` falls in, oldest first. */
export function monthKeys(now: Date, n = 13): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = n - 1; i >= 0; i--) {
    out.push(monthKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1))));
  }
  return out;
}

/** Roll a list of dates into counts per month key, zero-filled across `keys`. */
export function bucketByMonth(dates: Date[], keys: string[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const d of dates) {
    const k = monthKey(d);
    if (k in out) out[k] += 1;
  }
  return out;
}

async function totalsFor(orgIds: string[] | null): Promise<Totals> {
  // null = everyone. Otherwise scope every count to these organisations.
  //
  // PreSave and ClickEvent hang off a Release rather than an Organization — a fan belongs to the
  // release they pre-saved, not directly to the label — so those two scope through the relation.
  // Getting this wrong is not a type error you'd notice in a number: a missing filter would quietly
  // report the whole platform's pre-saves as one label's.
  const org = orgIds ? { organizationId: { in: orgIds } } : {};
  const orgSelf = orgIds ? { id: { in: orgIds } } : {};
  const viaRelease = orgIds ? { release: { organizationId: { in: orgIds } } } : {};

  const [smartLinks, bioPages, presaves, artistProfiles, artistAccounts, labelAccounts, logins, clicks, presaveEmails, contactEmails] =
    await Promise.all([
      prisma.release.count({ where: org }),
      prisma.bioPage.count({ where: org }),
      prisma.preSave.count({ where: viaRelease }),
      prisma.artist.count({ where: org }),
      prisma.organization.count({ where: { ...orgSelf, kind: "artist" } }),
      prisma.organization.count({ where: { ...orgSelf, kind: "label" } }),
      prisma.user.count({ where: org }),
      prisma.clickEvent.count({ where: viaRelease }),
      prisma.preSave.findMany({ where: { ...viaRelease, email: { not: null } }, select: { email: true } }),
      prisma.fanContact.findMany({ where: org, select: { email: true } }),
    ]);

  // Deduplicated in the app rather than with a distinct query, because "unique across two tables"
  // isn't one. Lower-cased: the same person with a capitalised address is the same person.
  const seen = new Set<string>();
  for (const r of presaveEmails) if (r.email) seen.add(r.email.toLowerCase());
  for (const r of contactEmails) if (r.email) seen.add(r.email.toLowerCase());

  return {
    smartLinks,
    bioPages,
    links: smartLinks + bioPages,
    uniqueFans: seen.size,
    presaves,
    artistProfiles,
    artistAccounts,
    labelAccounts,
    logins,
    clicks,
  };
}

export async function platformStats(now = new Date()): Promise<PlatformStats> {
  const excluded = internalSlugs();

  const [allOrgs, internalOrgs] = await Promise.all([
    prisma.organization.findMany({ select: { id: true, createdAt: true, slug: true } }),
    excluded.length
      ? prisma.organization.findMany({ where: { slug: { in: excluded } }, select: { id: true } })
      : Promise.resolve([] as { id: string }[]),
  ]);

  const internalIds = new Set(internalOrgs.map((o) => o.id));
  const externalIds = allOrgs.filter((o) => !internalIds.has(o.id)).map((o) => o.id);

  const [all, external] = await Promise.all([totalsFor(null), totalsFor(externalIds)]);

  const keys = monthKeys(now);
  const scope = { organizationId: { in: externalIds } };
  const [relDates, bioDates, preDates, contactDates] = await Promise.all([
    prisma.release.findMany({ where: scope, select: { createdAt: true } }),
    prisma.bioPage.findMany({ where: scope, select: { createdAt: true } }),
    prisma.preSave.findMany({ where: { release: scope }, select: { createdAt: true } }),
    prisma.fanContact.findMany({ where: scope, select: { createdAt: true } }),
  ]);

  const rel = bucketByMonth(relDates.map((r) => r.createdAt), keys);
  const bio = bucketByMonth(bioDates.map((r) => r.createdAt), keys);
  const fans = bucketByMonth([...preDates, ...contactDates].map((r) => r.createdAt), keys);
  const accounts = bucketByMonth(
    allOrgs.filter((o) => !internalIds.has(o.id)).map((o) => o.createdAt),
    keys,
  );

  return {
    all,
    external,
    months: keys.map((month) => ({ month, links: rel[month] + bio[month], fans: fans[month], accounts: accounts[month] })),
    excluded,
    firstAccountAt: allOrgs.filter((o) => !internalIds.has(o.id)).map((o) => o.createdAt).sort((a, b) => +a - +b)[0] ?? null,
    generatedAt: now,
  };
}

/** A plain-text block for pasting into an email, so the figures leave here already caveated. */
export function statsSummary(s: PlatformStats): string {
  const e = s.external;
  const since = s.firstAccountAt ? s.firstAccountAt.toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : "—";
  return [
    `droplr.fm — platform totals as at ${s.generatedAt.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}`,
    `Figures exclude our own accounts${s.excluded.length ? ` (${s.excluded.join(", ")})` : ""}.`,
    ``,
    `Accounts: ${e.labelAccounts} label, ${e.artistAccounts} artist (first joined ${since})`,
    `Links created: ${e.links} (${e.smartLinks} release pages, ${e.bioPages} bio pages)`,
    `Artist profiles on rosters: ${e.artistProfiles}`,
    `Unique fans reached: ${e.uniqueFans}`,
    `Pre-saves taken: ${e.presaves}`,
    `Clicks out to stores: ${e.clicks}`,
  ].join("\n");
}
