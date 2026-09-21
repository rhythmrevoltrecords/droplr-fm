import { headers } from "next/headers";
import { SITE_URL } from "@/lib/env";
import { GUIDES } from "@/lib/learn";
import { LEGAL, LEGAL_DOCS } from "@/lib/legal";
import { robotsAudience } from "@/lib/seo";
import { xmlSitemap, type SitemapEntry } from "@/lib/sitemap-xml";

/**
 * droplr.fm's own pages.
 *
 * A route handler rather than Next's sitemap.ts because it has to be able to 404: the same app
 * answers on every tenant custom domain, and a sitemap full of droplr.fm URLs served from
 * presave.somelabel.com is a cross-domain sitemap on a host that can't vouch for it. Google
 * ignores those, and the label didn't ask to advertise us from their domain.
 *
 * Deliberately no database access — this must never be the reason a deploy or a crawl fails.
 * Public release pages live in /sitemap-releases.xml.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const h = await headers();
  if (robotsAudience(h.get("x-forwarded-host") ?? h.get("host")) !== "platform") {
    return new Response("Not found", { status: 404 });
  }

  const now = new Date();
  const url = (path: string) => `${SITE_URL}${path}`;
  const entries: SitemapEntry[] = [
    { loc: url("/"), lastmod: now, changefreq: "weekly", priority: 1 },
    { loc: url("/pricing"), lastmod: now, changefreq: "weekly", priority: 0.9 },
    { loc: url("/learn"), lastmod: now, changefreq: "weekly", priority: 0.9 },
    { loc: url("/signup"), lastmod: now, changefreq: "monthly", priority: 0.7 },
    // The guides are the funnel. lastmod is the date each guide's facts were last checked
    // against the official sources, which is the honest answer and the one that matters.
    ...GUIDES.map((g) => ({
      loc: url(`/learn/${g.slug}`),
      lastmod: parseOr(g.checked, now),
      changefreq: "monthly" as const,
      priority: 0.8,
    })),
    ...["/docs/custom-domain", "/docs/spotify-byo"].map((p) => ({
      loc: url(p),
      lastmod: now,
      changefreq: "monthly" as const,
      priority: 0.4,
    })),
    { loc: url("/legal"), lastmod: now, changefreq: "yearly", priority: 0.3 },
    ...LEGAL_DOCS.map((d) => ({
      loc: url(`/legal/${d.slug}`),
      lastmod: parseOr(LEGAL.version, now),
      changefreq: "yearly" as const,
      priority: 0.2,
    })),
  ];

  return xmlSitemap(entries);
}

/** These dates are free text a human edits. An unparseable one must not break the sitemap. */
function parseOr(s: string, fallback: Date) {
  const t = Date.parse(s);
  return Number.isNaN(t) ? fallback : new Date(t);
}
