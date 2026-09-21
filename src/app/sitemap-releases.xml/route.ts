import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { publicReleaseUrl } from "@/lib/releases";
import { robotsAudience, seoIndexable } from "@/lib/seo";
import { headers } from "next/headers";

/**
 * Public release pages, as a sitemap of their own.
 *
 * Separate from /sitemap.xml and resolved per request on purpose. It needs the database, and a
 * sitemap is not worth a failed deploy — if this query breaks, the marketing sitemap and the
 * whole site are unaffected. force-dynamic also means it is never evaluated during `next build`,
 * which is what makes the build survive without a database URL.
 *
 * Only live, public releases: an upcoming pre-save page in the index means Google shows fans a
 * "not out yet" page for weeks after it is out. Releases on a verified custom domain are listed
 * at that domain, which is where their canonical tag already points.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const LIMIT = 5000; // one file's worth; a second is a problem worth having

export async function GET() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  // Only droplr.fm itself publishes this. On a preview host or a tenant domain it is a 404, so
  // the same list can't be claimed from two places.
  if (!seoIndexable() || robotsAudience(host) !== "platform") {
    return new Response("Not found", { status: 404 });
  }

  let rows: { slug: string; releaseDate: Date; organization: { slug: string; customDomain: string | null; plan: string | null; planUpdatedAt: Date | null; customDomainLiveAt: Date | null } }[] = [];
  try {
    rows = await prisma.release.findMany({
      where: { isPublic: true, status: "live" },
      orderBy: { releaseDate: "desc" },
      take: LIMIT,
      select: {
        slug: true,
        releaseDate: true,
        organization: {
          select: { slug: true, customDomain: true, plan: true, planUpdatedAt: true, customDomainLiveAt: true },
        },
      },
    });
  } catch {
    // An empty sitemap is a valid sitemap. Better than a 500 in Search Console.
    rows = [];
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...rows.map((r) => {
      const loc = publicReleaseUrl(r.organization, r.slug, SITE_URL);
      return `<url><loc>${escapeXml(loc)}</loc><lastmod>${r.releaseDate.toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`;
    }),
    "</urlset>",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
