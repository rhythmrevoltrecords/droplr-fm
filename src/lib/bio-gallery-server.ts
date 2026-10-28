import { cache } from "react";
import { bioPublicUrl } from "./bio";
import { isOwnImage } from "./bio-items";
import { SITE_URL } from "./env";
import { GALLERY_LIMIT, galleryBlurb, galleryEligible } from "./bio-gallery";
import { prisma } from "./db";
import { HAS_PUBLIC_MUSIC, NOT_SUSPENDED } from "./account-standing";
import { internalSlugs } from "./platform-stats";

export type GalleryCard = { url: string; title: string; blurb: string | null; imageUrl: string; accentColor: string | null };

/**
 * The listed pages, newest-listed first. The SQL narrows; galleryEligible decides -- the same
 * function the tests hold to the rules, so the query cannot drift into listing something the
 * rules would not.
 */
export const galleryPages = cache(async function galleryPages(): Promise<GalleryCard[]> {
  const internal = internalSlugs();
  const rows = await prisma.bioPage.findMany({
    // Not suspended, and no music, no gallery (lib/account-standing): it is droplr's shop window.
    where: { gallery: "on", isPublic: true, links: { some: { isActive: true, section: null } }, organization: { ...NOT_SUSPENDED, ...HAS_PUBLIC_MUSIC } },
    orderBy: [{ galleryAt: "desc" }, { createdAt: "desc" }],
    // Over-fetch so dropping internal accounts can't leave the page short.
    take: GALLERY_LIMIT + 20,
    select: {
      slug: true, title: true, bio: true, imageUrl: true, accentColor: true, gallery: true, isPublic: true,
      _count: { select: { links: { where: { isActive: true, section: null } } } },
      organization: { select: { slug: true, customDomain: true, plan: true, planUpdatedAt: true, customDomainLiveAt: true } },
    },
  });
  return rows
    .filter((r) => galleryEligible({ ...r, activeLinks: r._count.links, orgSlug: r.organization.slug }, internal, (u) => isOwnImage(u, SITE_URL)))
    .slice(0, GALLERY_LIMIT)
    .map((r) => ({
      // The page's real address -- the label's own domain when it has one -- so a visitor lands
      // where the artist sends people, and the gallery never competes with the page for its name.
      url: bioPublicUrl(r.organization, r.slug),
      title: r.title,
      blurb: galleryBlurb(r.bio),
      imageUrl: r.imageUrl,
      accentColor: r.accentColor,
    }));
});
