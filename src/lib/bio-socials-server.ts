import { prisma } from "./db";

/**
 * Which profile's socials a bio page or a release page shows.
 *
 * The page's own artist when it has one -- a label's page or release for one of its roster.
 * Otherwise, for an artist account, its one profile. A label's own page, or a label release with no
 * roster artist on it, has no profile, so it has no icons, and the editor says so rather than
 * guessing whose to borrow.
 *
 * Always scoped to the page's own organisation: artistProfileId is tenant-checked when it is
 * written, and checked again here so a stale or hand-edited id can never pull in another
 * organisation's socials.
 */
export async function socialSource(page: { organizationId: string; artistProfileId: string | null }, orgKind: string | null | undefined): Promise<unknown> {
  if (page.artistProfileId) {
    const a = await prisma.artist.findFirst({ where: { id: page.artistProfileId, organizationId: page.organizationId }, select: { socialLinks: true } });
    return a?.socialLinks ?? null;
  }
  if (orgKind !== "artist") return null;
  const a = await prisma.artist.findFirst({
    where: { organizationId: page.organizationId, status: { not: "alumni" } },
    // Same order the editor lists them in (lib/bio-socials socialsFor), so preview and page agree.
    orderBy: { name: "asc" },
    select: { socialLinks: true },
  });
  return a?.socialLinks ?? null;
}
