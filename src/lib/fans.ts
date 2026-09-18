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
