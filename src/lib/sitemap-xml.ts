export type SitemapEntry = {
  loc: string;
  lastmod?: Date;
  changefreq?: "weekly" | "monthly" | "yearly";
  priority?: number;
};

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/**
 * A sitemap, or a 404 if there is nothing to put in it.
 *
 * The 404 is the point. sitemaps.org requires at least one <url> inside <urlset>, and Google
 * rejects an empty one as malformed rather than treating it as "nothing yet" — which is exactly
 * what droplr.fm's release sitemap reported the day it was submitted, because the only release
 * on the platform was still upcoming. A 404 says "not yet" honestly and starts working by itself
 * the moment there's a first entry.
 */
export function xmlSitemap(entries: SitemapEntry[]) {
  if (entries.length === 0) return new Response("Not found", { status: 404 });
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((e) =>
      [
        "<url>",
        `<loc>${escapeXml(e.loc)}</loc>`,
        e.lastmod ? `<lastmod>${e.lastmod.toISOString()}</lastmod>` : "",
        e.changefreq ? `<changefreq>${e.changefreq}</changefreq>` : "",
        e.priority !== undefined ? `<priority>${e.priority}</priority>` : "",
        "</url>",
      ].filter(Boolean).join(""),
    ),
    "</urlset>",
  ].join("\n");
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
