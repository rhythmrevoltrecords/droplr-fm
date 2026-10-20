import { rosterRowAllowsBadge, type LabelBadge } from "./bio-label";
import { prisma } from "./db";
import { SITE_URL } from "./env";
import { linkCustomDomain } from "./plans";

/**
 * Label badges for one bio page, resolved against the database.
 *
 * Only ever for an organisation of kind "artist": a label's own page showing someone else's
 * label badge is not a thing that should be expressible.
 *
 * Both halves of the permission are required — the label's (Artist.labelBadge, and the row being
 * active) and the artist's (BioPage.labelBadge === "on"). Neither side publishes the other's name
 * on its own, and neither has to remember to take it down: the badge is derived every render from
 * the roster row, so ending the link or moving the artist to alumni removes it everywhere at once.
 */
export async function bioLabelBadges(
  page: { organizationId: string; labelBadge: string | null },
  org: { kind?: string | null },
): Promise<LabelBadge[]> {
  if (page.labelBadge !== "on" || org.kind !== "artist") return [];

  const owner = await prisma.user.findFirst({
    where: { organizationId: page.organizationId, role: "owner" },
    select: { id: true },
  });
  if (!owner) return [];

  const rows = await prisma.artist.findMany({
    where: { linkedUserId: owner.id },
    select: {
      labelBadge: true,
      status: true,
      linkedUserId: true,
      signedAt: true,
      organization: { select: { name: true, logoUrl: true, slug: true, customDomain: true, plan: true, planUpdatedAt: true, customDomainLiveAt: true } },
    },
    // More than one label is legitimate — an artist can be on several rosters — but a page is not
    // a discography. Oldest links first so the order is stable rather than whatever the planner returns.
    orderBy: { linkedAt: "asc" },
    take: 3,
  });

  return rows.filter((r) => rosterRowAllowsBadge(r, owner.id)).map((r) => {
    const domain = linkCustomDomain(r.organization);
    return {
      name: r.organization.name,
      logoUrl: r.organization.logoUrl,
      href: domain ? `https://${domain}` : `${SITE_URL}/${r.organization.slug}`,
      signed: r.signedAt !== null,
    };
  });
}
