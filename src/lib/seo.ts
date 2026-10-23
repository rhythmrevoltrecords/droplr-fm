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
/**
 * What a dead link calls itself.
 *
 * Shared so the page and its browser tab say the same thing, and set on every public route that
 * can 404 — these pages also answer on labels' own domains, where inheriting droplr.fm's default
 * title put droplr's marketing headline in the tab of somebody else's broken link.
 */
/** droplr's own title and description: the root layout's defaults, and the top of /llms.txt. */
export const SITE_TITLE = "droplr.fm — Launch every release like a label would";
export const SITE_DESCRIPTION = "Pre-saves that land at 9am in every fan's timezone, smart links with the DJ stores, promo plans and a fan list you keep. For independent artists and labels.";

export const NOT_FOUND_TITLE = "Nobody's in this room";

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
  // Not a page: /r/{id} is a 301 to the release's real URL, and an indexed redirect competes
  // with the page it points at.
  "/r/",
  // Internal rewrite target for custom domains. The same page is served at the tenant's own
  // address, which is the one that should be found.
  "/host/",
] as const;

/**
 * /b/ used to be on that list, and it was the only entry there that did not belong.
 *
 * The list is for signed-in surfaces and for URLs where the token IS the credential. A bio page
 * is neither: it is a public page an artist publishes and then puts in their Instagram bio. Being
 * absent from Google was not a decision anyone made about bio pages; it was a line in a list.
 *
 * It is allowed in now, with two things that have to stay true: a page with Public unticked still
 * 404s, and every copy of a page declares one canonical URL (lib/bio bioPublicUrl), so a page on
 * a custom domain and the same page on droplr.fm never compete with each other.
 */

/**
 * Carved out of NEVER_INDEX's "/api/". Cover art and bio pictures are served from /api/cover/, and
 * every release and bio page names one as its og:image. Blocked, Google Images can't index the
 * artwork and X's crawler, which obeys robots.txt, draws share cards with no picture. Crawlers
 * take the longest matching rule, so this Allow beats the shorter Disallow. These are files a
 * public page already shows; nothing private lives under this path.
 */
export const ALWAYS_CRAWLABLE = ["/api/cover/"] as const;

/**
 * droplr's own share card (app/opengraph-image.tsx, app/twitter-image.tsx). A page that sets its
 * own `openGraph` or `twitter` block REPLACES the inherited one, image included, so those pages
 * have to name the card again or they share as a blank.
 */
export const SITE_CARD = { og: "/opengraph-image", twitter: "/twitter-image" } as const;

/**
 * A description that fits a search result: whole if it's short enough, else cut at the last full
 * sentence that fits, else at a word, with an ellipsis. Google shows roughly 155 characters.
 */
export function snippet(text: string, max = 155): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sentence = cut.match(/^.*[.!?](?=\s|$)/)?.[0];
  if (sentence && sentence.length >= max * 0.4) return sentence;
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:—–-]+$/, "")}…`;
}

/**
 * Metadata for one of droplr's own pages: its title, its own description, its own canonical, and
 * a share card that says the same thing. Without the openGraph and twitter blocks a page shares
 * as the homepage, and with them but no images it shares as a blank (see SITE_CARD).
 */
export function pageMeta(o: { title: string; description: string; path: string }) {
  const share = `${o.title} · droplr.fm`;
  return {
    title: o.title,
    description: o.description,
    alternates: { canonical: o.path },
    openGraph: { title: share, description: o.description, url: o.path, images: [SITE_CARD.og] },
    twitter: { card: "summary_large_image" as const, title: share, description: o.description, images: [SITE_CARD.twitter] },
  };
}

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
