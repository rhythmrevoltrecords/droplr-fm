import { bioPublicUrl } from "./bio";
import { prisma } from "./db";

/**
 * What a label may see of a linked artist's OWN bio page, and what the artist is told about it.
 *
 * lib/roster-grant states the rule this bends: the grant is one-way, and "the label gets nothing
 * of the artist's". This is the first thing to cross that, so it crosses as little as possible:
 *
 *  - PUBLIC PAGES ONLY. A page the artist has published is already readable by anyone holding the
 *    URL. Handing the label that same URL gives away nothing the artist has not already given
 *    away. A page with the Public box unticked stays invisible, which is what that box means.
 *  - NO NUMBERS. Views and clicks are the artist's own audience data and stay theirs. The label
 *    sees that a page exists and where it is, not how it is doing.
 *  - NO EDITING. The label can open it and copy the link. Nothing else. A page the label built
 *    for an artist lives in the label's own organisation and is editable there as it always was.
 *  - ACTIVE ROSTER ROWS ONLY, same as the label badge: a prospect is not their artist yet and an
 *    alumni is not their artist any more.
 *  - AND THE ARTIST IS TOLD. linkedLabelNames feeds a line on the artist's own editor, because a
 *    one-way rule that quietly became two-way is worse than one that never existed.
 */

export type RosterBioPage = {
  id: string;
  title: string;
  imageUrl: string;
  accentColor: string | null;
  url: string;
  artistName: string;
};

/** Public bio pages belonging to the accounts of this label's active, linked roster artists. */
export async function rosterBioPages(organizationId: string): Promise<RosterBioPage[]> {
  const rows = await prisma.artist.findMany({
    where: { organizationId, status: "active", linkedUserId: { not: null } },
    select: { name: true, linkedUser: { select: { organizationId: true } } },
  });
  const orgIds = [...new Set(rows.map((r) => r.linkedUser?.organizationId).filter((id): id is string => !!id))];
  if (orgIds.length === 0) return [];

  const pages = await prisma.bioPage.findMany({
    // isPublic is the whole permission. Never relax it here.
    where: { organizationId: { in: orgIds }, isPublic: true },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, title: true, imageUrl: true, accentColor: true, slug: true,
      organization: { select: { id: true, name: true, slug: true, customDomain: true, plan: true, planUpdatedAt: true, customDomainLiveAt: true } },
    },
  });

  const nameByOrg = new Map(rows.filter((r) => r.linkedUser).map((r) => [r.linkedUser!.organizationId, r.name]));
  return pages.map((p) => ({
    id: p.id,
    title: p.title,
    imageUrl: p.imageUrl,
    accentColor: p.accentColor,
    // Their page on their own domain, not the label's.
    url: bioPublicUrl(p.organization, p.slug),
    artistName: nameByOrg.get(p.organization.id) ?? p.organization.name,
  }));
}

/** Labels whose roster this account is linked to, by name — for telling the artist who can see. */
export async function linkedLabelNames(organizationId: string): Promise<string[]> {
  const owner = await prisma.user.findFirst({ where: { organizationId, role: "owner" }, select: { id: true } });
  if (!owner) return [];
  const rows = await prisma.artist.findMany({
    where: { linkedUserId: owner.id, status: "active" },
    select: { organization: { select: { name: true } } },
    take: 5,
  });
  return [...new Set(rows.map((r) => r.organization.name))];
}
