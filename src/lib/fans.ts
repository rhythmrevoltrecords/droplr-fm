import { BIO_CONSENT_SOURCE } from "./bio-subscribe";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * One row per fan email across every release of an account. A fan is "reachable for news" only if they ticked the
 * optional news box on some pre-save and haven't unsubscribed from this account since.
 */
export type FanRow = {
  email: string;
  firstSeen: Date;
  lastSeen: Date;
  releases: number;
  news: boolean;
  unsubscribed: boolean;
  listenOn: string | null;
  country: string | null;
  timezone: string | null;
  clicked: boolean;
};

export type FanFilter = { q?: string; news?: boolean; unsubscribed?: boolean; country?: string; listenOn?: string };

function where(orgId: string, f: FanFilter) {
  const parts = [Prisma.sql`r."organizationId" = ${orgId}`, Prisma.sql`p.email IS NOT NULL`];
  if (f.q) parts.push(Prisma.sql`lower(p.email) LIKE ${`%${f.q.toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%`}`);
  return Prisma.join(parts, " AND ");
}

function having(f: FanFilter) {
  const parts: Prisma.Sql[] = [];
  if (f.news) parts.push(Prisma.sql`bool_or(p."newsConsent") AND NOT bool_or(p.status = 'unsubscribed')`);
  // A label can't re-subscribe anyone, but it should be able to see who is suppressed
  // rather than think the addresses vanished.
  if (f.unsubscribed) parts.push(Prisma.sql`bool_or(p.status = 'unsubscribed')`);
  if (f.country) parts.push(Prisma.sql`(array_agg(p.country ORDER BY p."createdAt" DESC) FILTER (WHERE p.country IS NOT NULL))[1] = ${f.country}`);
  if (f.listenOn) parts.push(Prisma.sql`(array_agg(p."listenOn" ORDER BY p."createdAt" DESC) FILTER (WHERE p."listenOn" IS NOT NULL))[1] = ${f.listenOn}`);
  return parts.length ? Prisma.sql`HAVING ${Prisma.join(parts, " AND ")}` : Prisma.empty;
}

export async function listFans(orgId: string, f: FanFilter, limit = 100, offset = 0) {
  const rows = await prisma.$queryRaw<(Omit<FanRow, "releases"> & { releases: bigint })[]>`
    SELECT lower(p.email) AS email,
      MIN(p."createdAt") AS "firstSeen",
      MAX(p."createdAt") AS "lastSeen",
      COUNT(DISTINCT p."releaseId") AS releases,
      bool_or(p."newsConsent") AND NOT bool_or(p.status = 'unsubscribed') AS news,
      bool_or(p.status = 'unsubscribed') AS unsubscribed,
      (array_agg(p."listenOn" ORDER BY p."createdAt" DESC) FILTER (WHERE p."listenOn" IS NOT NULL))[1] AS "listenOn",
      (array_agg(p.country ORDER BY p."createdAt" DESC) FILTER (WHERE p.country IS NOT NULL))[1] AS country,
      (array_agg(p.timezone ORDER BY p."createdAt" DESC) FILTER (WHERE p.timezone IS NOT NULL))[1] AS timezone,
      bool_or(p."clickedAt" IS NOT NULL) AS clicked
    FROM "PreSave" p JOIN "Release" r ON r.id = p."releaseId"
    WHERE ${where(orgId, f)}
    GROUP BY lower(p.email)
    ${having(f)}
    ORDER BY MAX(p."createdAt") DESC
    LIMIT ${limit} OFFSET ${offset}`;
  return rows.map((r) => ({ ...r, releases: Number(r.releases) }));
}

export async function fanSummary(orgId: string) {
  const [row] = await prisma.$queryRaw<{ total: bigint; news: bigint; unsub: bigint; returning: bigint }[]>`
    SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE news AND NOT unsub) AS news,
      COUNT(*) FILTER (WHERE unsub) AS unsub,
      COUNT(*) FILTER (WHERE releases > 1) AS returning
    FROM (
      SELECT bool_or(p."newsConsent") AS news, bool_or(p.status = 'unsubscribed') AS unsub, COUNT(DISTINCT p."releaseId") AS releases
      FROM "PreSave" p JOIN "Release" r ON r.id = p."releaseId"
      WHERE r."organizationId" = ${orgId} AND p.email IS NOT NULL
      GROUP BY lower(p.email)
    ) f`;
  const [countries, stores] = await Promise.all([
    prisma.$queryRaw<{ v: string; n: bigint }[]>`SELECT p.country AS v, COUNT(DISTINCT lower(p.email)) AS n FROM "PreSave" p JOIN "Release" r ON r.id = p."releaseId" WHERE r."organizationId" = ${orgId} AND p.email IS NOT NULL AND p.country IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
    prisma.$queryRaw<{ v: string; n: bigint }[]>`SELECT p."listenOn" AS v, COUNT(DISTINCT lower(p.email)) AS n FROM "PreSave" p JOIN "Release" r ON r.id = p."releaseId" WHERE r."organizationId" = ${orgId} AND p.email IS NOT NULL AND p."listenOn" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
  ]);
  return {
    total: Number(row?.total ?? 0),
    news: Number(row?.news ?? 0),
    unsubscribed: Number(row?.unsub ?? 0),
    returning: Number(row?.returning ?? 0),
    countries: countries.map((c) => ({ value: c.v, fans: Number(c.n) })),
    stores: stores.map((s) => ({ value: s.v, fans: Number(s.n) })),
  };
}

export type ImportedRow = {
  id: string; email: string; name: string | null; country: string | null;
  consentSource: string; consentAt: Date | null; consentKind: string; status: string; createdAt: Date;
};

const CONTACT_SELECT = {
  id: true, email: true, name: true, country: true, consentSource: true,
  consentAt: true, consentKind: true, status: true, createdAt: true,
} as const;

/**
 * FanContact holds two different things, and the screens must never merge them.
 *
 * An IMPORT came in from somewhere else on the account holder's word. A PAGE CAPTURE is a fan
 * who typed their address into a droplr page. The copy on the fans screen tells the reader an
 * imported contact is never in a release-day send and was consented to elsewhere — true of one
 * kind and misleading about the other. So every query here picks a side explicitly.
 */
const importedWhere = (orgId: string) => ({
  organizationId: orgId,
  NOT: { consentSource: BIO_CONSENT_SOURCE },
});
const capturedWhere = (orgId: string) => ({
  organizationId: orgId,
  consentSource: BIO_CONSENT_SOURCE,
});

/**
 * Contacts the label brought with them. Listed separately from pre-save fans on purpose: they
 * have no release history, no chosen store and no timezone, and showing them in the same table
 * would quietly imply droplr knows things about them that it doesn't.
 */
export async function listImported(orgId: string, q: string | undefined, limit = 100, offset = 0) {
  return prisma.fanContact.findMany({
    where: { ...importedWhere(orgId), ...(q ? { email: { contains: q.toLowerCase() } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    select: CONTACT_SELECT,
  });
}

/** Addresses fans typed into a droplr page of this account's own. */
export async function listCaptured(orgId: string, q: string | undefined, limit = 100, offset = 0) {
  return prisma.fanContact.findMany({
    where: { ...capturedWhere(orgId), ...(q ? { email: { contains: q.toLowerCase() } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    select: { ...CONTACT_SELECT, bioPage: { select: { title: true, slug: true } } },
  });
}

async function summaryFor(where: Record<string, unknown>) {
  const rows = await prisma.fanContact.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });
  const by = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return { total: rows.reduce((n, r) => n + r._count._all, 0), mailable: by("mailable"), pending: by("pending"), unsubscribed: by("unsubscribed") };
}

export const importedSummary = (orgId: string) => summaryFor(importedWhere(orgId));
export const capturedSummary = (orgId: string) => summaryFor(capturedWhere(orgId));

export type FanExportRow = {
  email: string;
  source: string;
  news_opt_in: boolean;
  unsubscribed: boolean;
  listens_on: string;
  country: string;
  timezone: string;
  releases_pre_saved: number;
  first_pre_save: string;
  last_pre_save: string;
  clicked_release_email: boolean;
  collected_on: string;
  consent_recorded: string;
};

/**
 * Every address the account holds, in one shape, for the two CSV routes.
 *
 * Both of those routes used to read listFans only — so every row in FanContact, imported or
 * captured on a page, was visible on screen and absent from every download. The fan list is
 * either the fan list or it isn't: an address you can see and cannot take with you is the exact
 * thing droplr exists to argue with. Adding the subscribe button is what made this a lie worth
 * fixing rather than a gap worth noting.
 *
 * ONE ROW PER ADDRESS. A fan who pre-saved and also subscribed on a page is one person, and
 * emitting them twice would mean whoever loads this into a mailing tool emails them twice. The
 * pre-save row wins because it carries more that is true (releases, store, clicks); `source`
 * names both so nothing about where they came from is lost.
 */
/** The closing export's cap: far above any real list, so in practice the whole list. */
export const CLOSING_EXPORT_LIMIT = 1_000_000;

export async function fanExportRows(orgId: string, f: FanFilter, limit = 50_000): Promise<FanExportRow[]> {
  const [fans, contacts] = await Promise.all([
    listFans(orgId, f, limit, 0),
    // The screen filters are release-shaped (store, country, news) and a contact has no release.
    // A filtered export therefore covers pre-save fans only, the same way a filtered send does.
    // An unfiltered export — which is the one the closure flow uses — covers everything.
    hasReleaseShapedFilter(f)
      ? Promise.resolve([] as Awaited<ReturnType<typeof listAllContacts>>)
      : listAllContacts(orgId, f.q, limit),
  ]);

  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : "");
  const capturedByEmail = new Map(contacts.map((c) => [c.email.toLowerCase(), c]));

  const rows: FanExportRow[] = fans.map((f2) => {
    const also = capturedByEmail.get(f2.email.toLowerCase());
    capturedByEmail.delete(f2.email.toLowerCase());
    return {
      email: f2.email,
      source: also ? `pre-save, ${also.consentSource}` : "pre-save",
      news_opt_in: f2.news,
      unsubscribed: f2.unsubscribed,
      listens_on: f2.listenOn ?? "",
      country: f2.country ?? "",
      timezone: f2.timezone ?? "",
      releases_pre_saved: f2.releases,
      first_pre_save: iso(f2.firstSeen),
      last_pre_save: iso(f2.lastSeen),
      clicked_release_email: f2.clicked,
      collected_on: also?.pageTitle ?? "",
      consent_recorded: iso(also?.consentAt),
    };
  });

  for (const c of capturedByEmail.values()) {
    rows.push({
      email: c.email,
      source: c.consentSource,
      // A contact is reachable by a news email when it is mailable; it has no release-day consent
      // at all, which is why releases_pre_saved and the pre-save dates are blank rather than zero-ish.
      news_opt_in: c.status === "mailable",
      unsubscribed: c.status === "unsubscribed",
      listens_on: "",
      country: c.country ?? "",
      timezone: "",
      releases_pre_saved: 0,
      first_pre_save: "",
      last_pre_save: "",
      clicked_release_email: false,
      collected_on: c.pageTitle ?? "",
      consent_recorded: iso(c.consentAt),
    });
  }
  return rows;
}

const hasReleaseShapedFilter = (f: FanFilter) => !!(f.news || f.unsubscribed || f.country || f.listenOn);

/** Both kinds of FanContact row, flattened, for the export. */
async function listAllContacts(orgId: string, q: string | undefined, limit: number) {
  const rows = await prisma.fanContact.findMany({
    where: { organizationId: orgId, ...(q ? { email: { contains: q.toLowerCase() } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      email: true, country: true, consentSource: true, consentAt: true, status: true,
      bioPage: { select: { title: true } },
    },
  });
  return rows.map((r) => ({ ...r, pageTitle: r.bioPage?.title ?? null }));
}
