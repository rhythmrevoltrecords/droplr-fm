import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { SITE_URL } from "@/lib/env";
import { NEVER_INDEX, robotsAudience } from "@/lib/seo";

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
    const proto = h.get("x-forwarded-proto") ?? "https";
    const self = `${proto}://${(host ?? "").split(":")[0]}`;
    return {
      rules: { userAgent: "*", allow: "/", disallow: [...NEVER_INDEX] },
      sitemap: `${self}/sitemap-releases.xml`,
    };
  }

  return {
    rules: { userAgent: "*", allow: "/", disallow: [...NEVER_INDEX] },
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/sitemap-releases.xml`],
    host: SITE_URL,
  };
}
