import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { SITE_URL } from "@/lib/env";
import { movedDomain } from "@/lib/releases";
import { ALWAYS_CRAWLABLE, NEVER_INDEX, robotsAudience } from "@/lib/seo";

// Host-aware, so it has to be resolved per request rather than baked at build: the same app
// serves droplr.fm, every *.droplr.fm subdomain, every tenant custom domain and the Netlify
// preview hostnames, and those four want four different answers.
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const audience = robotsAudience(host);

  if (audience === "blocked") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  // A tenant's own domain: their release pages are the point, so let those be found, and point
  // at THEIR sitemap — droplr.fm's describes droplr.fm, and offering it from someone else's
  // domain is a cross-site claim Google is right to ignore. /sitemap-releases.xml on this host
  // serves only this tenant's releases, and 404s until they have a live one.
  if (audience === "tenant") {
    // A domain the account has moved away from: every page on it 308s to the new one, so let
    // crawlers in to follow those, but advertise no sitemap here. The old sitemaps are empty by
    // design, and listing them made crawlers ask for them on every visit and log a 404 each time.
    if ((await movedDomain(host ?? "")).moved) {
      return { rules: { userAgent: "*", allow: ["/"] } };
    }
    const proto = h.get("x-forwarded-proto") ?? "https";
    const self = `${proto}://${(host ?? "").split(":")[0]}`;
    return {
      rules: { userAgent: "*", allow: ["/", ...ALWAYS_CRAWLABLE], disallow: [...NEVER_INDEX] },
      sitemap: [`${self}/sitemap-releases.xml`, `${self}/sitemap-bio.xml`],
    };
  }

  return {
    rules: { userAgent: "*", allow: ["/", ...ALWAYS_CRAWLABLE], disallow: [...NEVER_INDEX] },
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/sitemap-releases.xml`, `${SITE_URL}/sitemap-bio.xml`],
    host: SITE_URL,
  };
}
