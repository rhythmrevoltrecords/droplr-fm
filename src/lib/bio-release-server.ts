import { pickBioRelease } from "./bio-release";
import { prisma } from "./db";
import { SITE_URL } from "./env";
import { publicReleaseUrl } from "./releases";

/**
 * The release block for one bio page, resolved against the database.
 *
 * Split from lib/bio-release (pure) for the usual reason: this file imports prisma, and anything
 * importing it is server-only. The admin form and the public page both call this so the preview
 * an artist sees cannot drift from what a fan gets.
 */
export async function bioReleaseFor(
  page: { organizationId: string; artistProfileId: string | null; releaseBlock: string | null },
  org: { slug: string; customDomain: string | null; plan?: string | null; planUpdatedAt?: Date | null; customDomainLiveAt?: Date | null },
  now = new Date(),
) {
  // Opt-in: anything other than "on" shows nothing. See the column comment in schema.prisma.
  if (page.releaseBlock !== "on") return null;
  const rows = await prisma.release.findMany({
    where: {
      organizationId: page.organizationId,
      kind: "release",
      isPublic: true,
      ...(page.artistProfileId ? { artistProfileId: page.artistProfileId } : {}),
    },
    // 20 is far more than the picker needs — it sorts them itself — and releaseDate is indexed.
    orderBy: { releaseDate: "desc" },
    take: 20,
    select: { id: true, slug: true, title: true, artistName: true, coverUrl: true, accentColor: true, releaseDate: true, isPublic: true, kind: true },
  });
  const choice = pickBioRelease(rows, now);
  if (!choice) return null;
  return {
    state: choice.state,
    title: choice.release.title,
    artistName: choice.release.artistName,
    coverUrl: choice.release.coverUrl,
    releaseDate: choice.release.releaseDate,
    href: publicReleaseUrl(org, choice.release.slug, SITE_URL),
  };
}
