import { headers } from "next/headers";
import { SITE_URL } from "@/lib/env";
import { livePosts } from "@/lib/blog";
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
    // No lastmod where droplr has no honest date for the page. It used to be "now" on every request,
    // and Google stops trusting lastmod once it can see the date is always the time of the crawl.
    { loc: url("/"), changefreq: "weekly", priority: 1 },
    { loc: url("/pricing"), changefreq: "weekly", priority: 0.9 },
    { loc: url("/learn"), lastmod: newest(GUIDES.map((g) => g.checked)), changefreq: "weekly", priority: 0.9 },
    { loc: url("/blog"), lastmod: newest(livePosts(now).map((p) => p.publishAt)), changefreq: "weekly", priority: 0.9 },
    // A free tool: the page that answers "how do I plan a release", for people who have never heard of droplr.
    { loc: url("/tools/release-plan"), changefreq: "monthly", priority: 0.9 },
    { loc: url("/roadmap"), changefreq: "monthly", priority: 0.6 },
    { loc: url("/signup"), changefreq: "monthly", priority: 0.7 },
    // The guides are the funnel. lastmod is the date each guide's facts were last checked
    // against the official sources, which is the honest answer and the one that matters.
    ...GUIDES.map((g) => ({
      loc: url(`/learn/${g.slug}`),
      lastmod: parseOr(g.checked, now),
      changefreq: "monthly" as const,
      priority: 0.8,
    })),
    // News posts. lastmod is the publish date, which for a post is also the day its facts were
    // true: these report a case or an investigation as it stood, and are not edited afterwards.
    ...livePosts(now).map((p) => ({
      loc: url(`/blog/${p.slug}`),
      lastmod: parseOr(p.publishAt, now),
      changefreq: "yearly" as const,
      priority: 0.7,
    })),
    ...["/docs/custom-domain", "/docs/spotify-byo"].map((p) => ({
      loc: url(p),
      changefreq: "monthly" as const,
      priority: 0.4,
    })),
    { loc: url("/legal"), lastmod: parseOr(LEGAL.version, undefined), changefreq: "yearly", priority: 0.3 },
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
function parseOr<T extends Date | undefined>(s: string, fallback: T): Date | T {
  const t = Date.parse(s);
  return Number.isNaN(t) ? fallback : new Date(t);
}

/** The latest of some dates, or none if none parse. */
function newest(dates: string[]): Date | undefined {
  const ts = dates.map((d) => Date.parse(d)).filter((t) => !Number.isNaN(t));
  return ts.length ? new Date(Math.max(...ts)) : undefined;
}
