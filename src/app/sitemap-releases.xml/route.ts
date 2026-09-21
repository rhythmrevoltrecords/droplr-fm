import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { linkCustomDomain } from "@/lib/plans";
import { publicReleaseUrl } from "@/lib/releases";
import { robotsAudience } from "@/lib/seo";
import { xmlSitemap, type SitemapEntry } from "@/lib/sitemap-xml";

/**
 * Public release pages, split by the host that serves them.
 *
 * A sitemap may only list URLs on its own host. droplr.fm's copy therefore lists releases that
 * actually live on droplr.fm — accounts with no live custom domain — and a label's own domain
 * serves its own releases at its own URLs. Listing presave.somelabel.com inside droplr.fm's
 * sitemap would be a cross-domain claim Google ignores, and it would put the label's pages in
 * our Search Console rather than theirs.
 *
 * Resolved per request: it needs the database, and force-dynamic keeps it out of `next build`,
 * which is what lets the build run with no database URL at all.
 *
 * Only live, public releases. An upcoming pre-save page in the index means Google shows fans a
 * "not out yet" page for weeks after it is out.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const LIMIT = 5000; // one file's worth; a second is a problem worth having

export async function GET() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").toLowerCase().split(":")[0];
  const audience = robotsAudience(host);
  if (audience === "blocked") return new Response("Not found", { status: 404 });

  let rows;
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
    // Don't serve a wrong answer as if it were right: 503 asks Google to come back, where an
    // empty sitemap would quietly tell it we have no releases.
    return new Response("Sitemap temporarily unavailable", { status: 503 });
  }

  const entries: SitemapEntry[] = [];
  for (const r of rows) {
    const domain = linkCustomDomain(r.organization);
    // droplr.fm lists only what it serves; a tenant host lists only its own.
    if (audience === "platform" ? !!domain : domain !== host) continue;
    entries.push({
      loc: publicReleaseUrl(r.organization, r.slug, SITE_URL),
      lastmod: r.releaseDate,
      changefreq: "weekly",
      priority: 0.6,
    });
  }

  return xmlSitemap(entries);
}
