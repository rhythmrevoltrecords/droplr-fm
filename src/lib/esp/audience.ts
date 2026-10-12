import { prisma } from "@/lib/db";
import type { AudienceMember } from "./types";

// The exact audience the news engine would reach, as plain {email,name,country}.
//
// Two sources, deduped by lowercased email:
//   1. Pre-savers who ticked the news box and never unsubscribed from this label.
//   2. Imported contacts marked mailable — minus anyone who later unsubscribed via a pre-save,
//      because an opt-out is to the LABEL and an import must never quietly undo one.
// Everyone returned has marketing consent by construction, so nothing transactional can leak out.

export async function espAudience(orgId: string): Promise<AudienceMember[]> {
  const [presavers, imported] = await Promise.all([
    prisma.$queryRaw<{ email: string; country: string | null }[]>`
      SELECT lower(p.email) AS email,
        (array_agg(p.country ORDER BY p."createdAt" DESC) FILTER (WHERE p.country IS NOT NULL))[1] AS country
      FROM "PreSave" p JOIN "Release" r ON r.id = p."releaseId"
      WHERE r."organizationId" = ${orgId} AND p.email IS NOT NULL
      GROUP BY lower(p.email)
      HAVING bool_or(p."newsConsent") AND NOT bool_or(p.status = 'unsubscribed')`,
    prisma.$queryRaw<{ email: string; name: string | null; country: string | null }[]>`
      SELECT lower(fc.email) AS email, fc.name, fc.country
      FROM "FanContact" fc
      WHERE fc."organizationId" = ${orgId} AND fc.status = 'mailable'
        AND NOT EXISTS (
          SELECT 1 FROM "PreSave" p JOIN "Release" r ON r.id = p."releaseId"
          WHERE r."organizationId" = ${orgId} AND lower(p.email) = lower(fc.email) AND p.status = 'unsubscribed')`,
  ]);

  const byEmail = new Map<string, AudienceMember>();
  for (const r of presavers) byEmail.set(r.email, { email: r.email, name: null, country: r.country });
  for (const r of imported) {
    const existing = byEmail.get(r.email);
    if (existing) {
      existing.name ??= r.name;
      existing.country ??= r.country;
    } else {
      byEmail.set(r.email, { email: r.email, name: r.name, country: r.country });
    }
  }
  return [...byEmail.values()];
}

export async function espAudienceCount(orgId: string): Promise<number> {
  return (await espAudience(orgId)).length;
}
