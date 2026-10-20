import { BIO_RELEASE_LIMIT, pickBioReleases } from "./bio-release";
import { prisma } from "./db";
import { SITE_URL } from "./env";
import { publicReleaseUrl } from "./releases";
import { grantedReleaseWhere, grantsFor } from "./roster-grant";

/**
 * The release block for one bio page, resolved against the database.
 *
 * Split from lib/bio-release (pure) for the usual reason: this file imports prisma, and anything
 * importing it is server-only. The admin form and the public page both call this so the preview
 * an artist sees cannot drift from what a fan gets.
 */

const RELEASE_SELECT = {
  id: true,
  slug: true,
  title: true,
  artistName: true,
  coverUrl: true,
  accentColor: true,
  releaseDate: true,
  isPublic: true,
  kind: true,
  // The owning organisation, because a granted release lives in the LABEL's org: its public URL
  // has to be built from the label's slug and custom domain, not from whoever's page is showing it.
  organization: { select: { slug: true, customDomain: true, plan: true, planUpdatedAt: true, customDomainLiveAt: true } },
} as const;

/**
 * An artist account's roster grants, as a release filter — or null when there are none.
 *
 * Only for an organisation of kind "artist". A label's own bio page must never pull in another
 * label's catalogue, and a label org has no reason to hold grants in the first place.
 *
 * The grant itself is the label's decision, already made and already audited (lib/roster-grant):
 * read-only, one-way, and limited to releases that name the artist. What this adds is that a
 * granted release may also appear on that artist's own public page — including an upcoming one,
 * because the pre-save is the entire point of an upcoming release and the artist pushing their
 * own pre-save is what the grant is for. A label that does not want a record seen yet has the
 * control it already had: `isPublic` off keeps it off every page, this one included.
 */
async function grantFilter(organizationId: string, orgKind: string | null | undefined) {
  if (orgKind !== "artist") return null;
  const owner = await prisma.user.findFirst({
    where: { organizationId, role: "owner" },
    select: { id: true },
  });
  if (!owner) return null;
  const grants = await grantsFor(owner.id);
  return grantedReleaseWhere(owner.id, grants);
}

export async function bioReleaseFor(
  page: { organizationId: string; artistProfileId: string | null; releaseBlock: string | null },
  org: { kind?: string | null },
  now = new Date(),
) {
  // Opt-in: anything other than "on" shows nothing. See the column comment in schema.prisma.
  if (page.releaseBlock !== "on") return [];

  const own = {
    organizationId: page.organizationId,
    ...(page.artistProfileId ? { artistProfileId: page.artistProfileId } : {}),
  };
  const granted = await grantFilter(page.organizationId, org.kind);

  const rows = await prisma.release.findMany({
    // kind and isPublic apply to both branches: a gated download pack is not a release, and a
    // release held back by its own label stays held back wherever it would otherwise appear.
    where: { kind: "release", isPublic: true, ...(granted ? { OR: [own, granted] } : own) },
    // Deliberately more than the page shows: the picker re-sorts upcoming ahead of released, so
    // a date-ordered fetch of exactly the limit could miss a record that belongs at the top.
    // releaseDate is indexed, and the cover images are lazy below the first row.
    orderBy: { releaseDate: "desc" },
    take: BIO_RELEASE_LIMIT * 4,
    select: RELEASE_SELECT,
  });

  return pickBioReleases(rows, now).map((choice) => {
    // The link has to carry the OWNING organisation's slug and domain: a label release shown on
    // an artist's page lives on the label's domain, not theirs.
    const owner = rows.find((r) => r.id === choice.release.id)!.organization;
    return {
      state: choice.state,
      title: choice.release.title,
      artistName: choice.release.artistName,
      coverUrl: choice.release.coverUrl,
      releaseDate: choice.release.releaseDate,
      href: publicReleaseUrl(owner, choice.release.slug, SITE_URL),
    };
  });
}
