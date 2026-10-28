import { headers } from "next/headers";
import { movedDomain } from "@/lib/releases";
import { bioPublicUrl } from "@/lib/bio";
import { prisma } from "@/lib/db";
import { HAS_PUBLIC_MUSIC, NOT_SUSPENDED } from "@/lib/account-standing";
import { linkCustomDomain } from "@/lib/plans";
import { robotsAudience } from "@/lib/seo";
import { xmlSitemap, type SitemapEntry } from "@/lib/sitemap-xml";

/**
 * Public bio pages, split by the host that serves them — the same rule as the release sitemap.
 *
 * A sitemap may only list URLs on its own host, so droplr.fm lists the pages that actually live
 * on droplr.fm (accounts with no live custom domain) and a label's own domain lists its own. A
 * cross-domain list is one Google ignores, and it would put the label's pages in droplr's Search
 * Console rather than theirs.
 *
 * Only pages with Public ticked. That box is the artist's decision about whether the page exists
 * for other people at all, and a sitemap is the loudest way to tell Google it does.
 *
 * Resolved per request and force-dynamic, so a build never needs a database.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const LIMIT = 5000;

export async function GET() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").toLowerCase().split(":")[0];
  const audience = robotsAudience(host);
  if (audience === "blocked") return new Response("Not found", { status: 404 });
  // A domain the account moved away from: send the request to the same sitemap on the new one.
  if (audience === "tenant") {
    const m = await movedDomain(host);
    if (m.moved) return m.to ? Response.redirect(`https://${m.to}/sitemap-bio.xml`, 308) : new Response("Gone", { status: 410 });
  }

  let rows;
  try {
    rows = await prisma.bioPage.findMany({
      // Not suspended, and no music, no index (lib/account-standing).
      where: { isPublic: true, organization: { ...NOT_SUSPENDED, ...HAS_PUBLIC_MUSIC } },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      select: {
        slug: true,
        createdAt: true,
        organization: { select: { slug: true, customDomain: true, plan: true, planUpdatedAt: true, customDomainLiveAt: true } },
      },
    });
  } catch {
    // 503 asks Google to come back. An empty sitemap would quietly claim there are none.
    return new Response("Sitemap temporarily unavailable", { status: 503 });
  }

  const entries: SitemapEntry[] = [];
  for (const p of rows) {
    const domain = linkCustomDomain(p.organization);
    if (audience === "platform" ? !!domain : domain !== host) continue;
    entries.push({ loc: bioPublicUrl(p.organization, p.slug), lastmod: p.createdAt, changefreq: "weekly", priority: 0.5 });
  }

  return xmlSitemap(entries);
}
