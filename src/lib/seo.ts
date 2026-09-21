import { isPlatformHost, platformSubdomain } from "./env";

/**
 * Whether search engines may index droplr.fm's own pages.
 *
 * Deliberately NOT tied to signupsOpen(). The eleven /learn guides are droplr's only organic
 * acquisition channel, and indexing takes months to be worth anything — a closed signup form is
 * a reason to show "Request early access" on the page, not a reason to be invisible to Google
 * until launch day. Tying the two together meant the funnel switched on the day it stopped
 * mattering.
 *
 * Off automatically on Netlify deploy previews and branch deploys, so a preview build can never
 * compete with the real site for its own terms. SEO_NOINDEX=true pulls everything back out.
 */
export function seoIndexable() {
  if (process.env.SEO_NOINDEX === "true") return false;
  const ctx = process.env.CONTEXT; // Netlify: production | deploy-preview | branch-deploy
  return !ctx || ctx === "production";
}

/**
 * Path prefixes that must never be indexed, even when the site is indexable.
 *
 * Two kinds, one list. Signed-in surfaces: nothing behind a login belongs in a search result,
 * and they're all redirects to /login for a crawler anyway. And anything carrying a secret in
 * the URL — an invite or report token in Google's index is that link handed to whoever searches
 * for it, which is the whole protection those tokens provide.
 */
export const NEVER_INDEX = [
  "/admin",
  "/dashboard",
  "/platform",
  "/invite",
  "/report",
  "/reset-password",
  "/forgot-password",
  "/demo",
  "/api/",
  "/b/",
  "/r/",
  "/host/",
] as const;

/** Spread into a page's `metadata` to keep it out of search whatever the site-wide setting is. */
export const NOINDEX = { robots: { index: false, follow: false } } as const;

/**
 * Which robots.txt a host should get.
 *
 * droplr serves every tenant from the same Next app, so a label's custom domain hits this route
 * too. It must not be handed droplr.fm's sitemap — that would point Google at a different site
 * from the one it asked — and a deploy-preview hostname must be refused outright.
 */
export function robotsAudience(host: string | null | undefined): "blocked" | "tenant" | "platform" {
  if (!seoIndexable()) return "blocked";
  const h = (host ?? "").toLowerCase().split(":")[0];
  // Netlify's own hostnames are "platform" to isPlatformHost (the app must work on them), but
  // they are duplicates of droplr.fm as far as a crawler is concerned.
  if (h.endsWith(".netlify.app") || h.endsWith(".netlify.live")) return "blocked";
  if (!isPlatformHost(h) || platformSubdomain(h)) return "tenant";
  return "platform";
}
