import { prisma } from "@/lib/db";
import { optedOutAmong } from "@/lib/fan-consent";
import type { AudienceMember } from "./types";

// The exact audience the news engine would reach, as plain {email,name,country}.
//
// Two sources, deduped by lowercased email:
//   1. Pre-savers who ticked the news box and never unsubscribed from this label.
//   2. FanContact rows marked mailable — contacts the account imported AND addresses fans typed
//      into a droplr page themselves. Both are marketing consent by construction: an import is
//      only ever created mailable when its consentKind is "marketing" (lib/fan-import-server),
//      and a page capture is the fan's own act on wording droplr showed. Nothing transactional
//      can leak out.
//
// THIS FUNCTION HANDS AN ADDRESS TO A THIRD PARTY, and droplr cannot take that back afterwards.
// That makes it the worst place in the codebase for an opt-out to be missed, so the opt-out check
// is not written here: lib/fan-consent owns the single definition and the merged list is filtered
// through it at the end.
//
// It used to be written here, as `NOT EXISTS (… p.status = 'unsubscribed')`, and that was too
// narrow. Unsubscribing writes `status: "unsubscribed"` onto `platform: "email"` rows only, so a
// fan who had only ever pre-saved through Spotify or Deezer left no such row behind — just
// `emailConsent: false`. If that address also sat in FanContact as mailable, this pushed them to
// Mailchimp after they had said stop. scripts/test-esp-audience.ts has the case.

export async function espAudience(orgId: string): Promise<AudienceMember[]> {
  const [presavers, imported] = await Promise.all([
    prisma.$queryRaw<{ email: string; country: string | null }[]>`
      SELECT lower(p.email) AS email,
        (array_agg(p.country ORDER BY p."createdAt" DESC) FILTER (WHERE p.country IS NOT NULL))[1] AS country
      FROM "PreSave" p JOIN "Release" r ON r.id = p."releaseId"
      WHERE r."organizationId" = ${orgId} AND p.email IS NOT NULL
      GROUP BY lower(p.email)
      HAVING bool_or(p."newsConsent" AND p."newsConfirmedAt" IS NOT NULL) AND NOT bool_or(p.status = 'unsubscribed')`,
    prisma.$queryRaw<{ email: string; name: string | null; country: string | null }[]>`
      SELECT lower(fc.email) AS email, fc.name, fc.country
      FROM "FanContact" fc
      WHERE fc."organizationId" = ${orgId} AND fc.status = 'mailable'`,
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
  // One check, over both sources, using the definition lib/fan-consent owns. Applied to the
  // merged list rather than inside either query, so neither branch can grow a hole of its own.
  const optedOut = await optedOutAmong([...byEmail.keys()], orgId);
  return [...byEmail.values()].filter((m) => !optedOut.has(m.email.toLowerCase()));
}

export async function espAudienceCount(orgId: string): Promise<number> {
  return (await espAudience(orgId)).length;
}
