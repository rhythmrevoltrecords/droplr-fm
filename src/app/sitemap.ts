import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";
import { GUIDES } from "@/lib/learn";
import { LEGAL, LEGAL_DOCS } from "@/lib/legal";

/**
 * droplr.fm's own pages. Deliberately no database access: this is generated at build time and
 * must never be the reason a deploy fails. Public release pages live in /sitemap-releases.xml,
 * which is queried per request.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const url = (path: string) => `${SITE_URL}${path}`;

  const marketing: MetadataRoute.Sitemap = [
    { url: url("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: url("/pricing"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: url("/learn"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: url("/signup"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];

  // The guides are the funnel. lastModified is the date the facts in each were last checked
  // against the official sources, which is the honest answer and the one that moves rankings.
  const guides: MetadataRoute.Sitemap = GUIDES.map((g) => ({
    url: url(`/learn/${g.slug}`),
    lastModified: new Date(g.checked) instanceof Date && !isNaN(Date.parse(g.checked)) ? new Date(g.checked) : now,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const docs: MetadataRoute.Sitemap = ["/docs/custom-domain", "/docs/spotify-byo"].map((p) => ({
    url: url(p),
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.4,
  }));

  const legal: MetadataRoute.Sitemap = [
    { url: url("/legal"), lastModified: now, changeFrequency: "yearly" as const, priority: 0.3 },
    ...LEGAL_DOCS.map((d) => ({
      url: url(`/legal/${d.slug}`),
      lastModified: new Date(LEGAL.version),
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];

  return [...marketing, ...guides, ...docs, ...legal];
}
