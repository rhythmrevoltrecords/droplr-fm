import { prisma } from "./db";

/**
 * Roster grants: an artist who already has their own droplr account, linked to a label's roster
 * row so the label's releases under their name appear on their own dashboard.
 *
 * The rule this file exists to hold, because it is the one that can go wrong quietly:
 *
 *   A grant is READ-ONLY, ONE-WAY, and scoped to releases that name the artist.
 *
 * Read-only comes free — every release write route goes through apiUser("label") and scopes by
 * the caller's own organizationId, and a linked artist is not a member of the label's
 * organisation. They are an owner of their OWN organisation, so every label route they can
 * reach resolves to their own data, never the label's.
 *
 * One-way means the label gets nothing. Linking an artist does not show the label that artist's
 * own releases, fans, plan or anything else.
 *
 * Scoped means the artist sees the releases where they are the named artist and nothing else —
 * not the label's other artists, not the label's fan list, not any aggregate.
 *
 * The audit that makes this safe (22 Sep 2026): every query in the codebase reading
 * Release.artistId already also filters organizationId. So pointing artistId at an account in
 * another organisation widens nothing by itself. Access is only ever granted by a caller that
 * explicitly asks for it through the helpers below.
 */

/** Roster rows on other labels that this account has accepted a link to. */
export async function grantsFor(userId: string) {
  return prisma.artist.findMany({
    where: { linkedUserId: userId },
    select: { id: true, organizationId: true, name: true, linkedAt: true, organization: { select: { name: true, plan: true, timezone: true } } },
  });
}

/**
 * Releases a granted artist may read: in the granting org, and naming them.
 *
 * Both halves matter. Without the org filter this would be every release anywhere that names
 * them; without the artist filter it would be the label's whole catalogue.
 */
export function grantedReleaseWhere(userId: string, grants: { id: string; organizationId: string }[]) {
  if (grants.length === 0) return null;
  return {
    OR: grants.map((g) => ({
      organizationId: g.organizationId,
      OR: [{ artistProfileId: g.id }, { artistId: userId }],
    })),
  };
}

/**
 * Can this account read that one release through a grant?
 *
 * Used by the few read-only routes an artist should reach for a label's release — the share
 * graphics. Never used by anything that writes, and never by the fan export: the fans a
 * label's release collected are the label's, not the artist's, and that stays true whoever
 * made the record.
 */
export async function grantedRelease(userId: string, releaseId: string) {
  const grants = await grantsFor(userId);
  const where = grantedReleaseWhere(userId, grants);
  if (!where) return null;
  return prisma.release.findFirst({ where: { id: releaseId, ...where } });
}

/** Is this account already linked to that roster row? */
export async function isLinked(artistProfileId: string, userId: string) {
  const row = await prisma.artist.findFirst({ where: { id: artistProfileId, linkedUserId: userId }, select: { id: true } });
  return !!row;
}
