import { linkCustomDomain } from "./plans";

/**
 * A release's one public address: the label's custom domain while it is live on their plan, else
 * droplr.fm/<org>/<slug>. Also the canonical every copy of the page declares.
 *
 * Its own file, with no React and no database, because the release-day job is bundled by
 * Netlify's esbuild outside Next and needs the same answer.
 */
export function publicReleaseUrl(org: { slug: string; customDomain: string | null; plan?: string | null; planUpdatedAt?: Date | null; customDomainLiveAt?: Date | null }, slug: string, siteUrl: string, variant?: string) {
  // Callers without plan info (e.g. previews) pass customDomain: null.
  const domain = org.plan === undefined ? org.customDomain : linkCustomDomain({ plan: org.plan, customDomain: org.customDomain, planUpdatedAt: org.planUpdatedAt, customDomainLiveAt: org.customDomainLiveAt ?? null });
  const base = domain ? `https://${domain}/${slug}` : `${siteUrl}/${org.slug}/${slug}`;
  return variant ? `${base}/${variant}` : base;
}
