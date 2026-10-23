import { headers } from "next/headers";
import { livePosts } from "@/lib/blog";
import { SITE_URL } from "@/lib/env";
import { GUIDES } from "@/lib/learn";
import { llmsTxt } from "@/lib/llms";
import { pricingTiers } from "@/lib/pricing-tiers";
import { robotsAudience, SITE_DESCRIPTION, SITE_TITLE } from "@/lib/seo";

/**
 * droplr.fm only. Middleware never sees .txt requests, so this route also answers on every label's
 * custom domain, where a map of droplr.fm would be droplr speaking from someone else's address.
 * Same rule as /sitemap.xml: 404 anywhere but the platform host.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const h = await headers();
  if (robotsAudience(h.get("x-forwarded-host") ?? h.get("host")) !== "platform") return new Response("Not found", { status: 404 });
  const tiers = pricingTiers();
  const body = llmsTxt({
    site: SITE_URL,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    plans: [
      { audience: "Artist", tiers: tiers.artist.map((t) => ({ name: t.name, price: t.price, blurb: t.blurb })) },
      { audience: "Label", tiers: tiers.label.map((t) => ({ name: t.name, price: t.price, blurb: t.blurb })) },
    ],
    guides: GUIDES.map((g) => ({ slug: g.slug, title: g.title, summary: g.summary })),
    posts: livePosts(new Date()).map((p) => ({ slug: p.slug, title: p.title, summary: p.summary })),
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
