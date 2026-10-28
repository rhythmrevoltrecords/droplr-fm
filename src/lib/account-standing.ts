/**
 * Two rules about whether an account's pages should exist for the public, kept in one place.
 *
 * 1. SUSPENDED. Set by the platform owner from /platform. Every public page, link redirect, gate
 *    and pre-save of the account answers like an unknown address (404), and its logins are signed
 *    out. Nothing is deleted: lifting the suspension brings every page back exactly as it was.
 *    Already-queued fan deliveries (release-day saves and emails fans asked for) are not stopped.
 *
 * 2. NO MUSIC, NO INDEX. droplr is for music. A bio page or label page whose account has no public
 *    release is served to anyone with the link, but carries noindex and stays out of the sitemaps
 *    and the gallery. That takes away the reason to sign up just to park links to an unrelated
 *    business on droplr.fm (27 Oct 2026: two Indian investment-platform accounts did exactly this),
 *    without anyone having to keep a list by hand. Publishing a release lifts it automatically.
 *
 * Plain values only (no prisma import), so tests and client-safe code can read the rules.
 */

/** Prisma `where` on Organization: not suspended. */
export const NOT_SUSPENDED = { suspendedAt: null } as const;

/** Prisma `where` on Organization: has at least one public release (upcoming or out). */
export const HAS_PUBLIC_MUSIC = { releases: { some: { isPublic: true } } } as const;

export function isSuspended(org: { suspendedAt: Date | null } | null | undefined): boolean {
  return !!org?.suspendedAt;
}

/**
 * Why this account can't be suspended, or null. Checked by the API, shown by the control.
 * - droplr's own accounts: suspending one would take RRR's releases offline.
 * - an account a platform admin logs in to: you'd sign yourself out of the console that lifts it.
 * - a live Stripe subscription: they'd keep being charged for an account they can't open.
 */
export function suspendBlocker(
  org: { slug: string; stripeSubscriptionId: string | null },
  opts: { internalSlugs: string[]; hasPlatformAdmin: boolean },
): string | null {
  if (opts.internalSlugs.includes(org.slug)) return "This is one of droplr's own accounts.";
  if (opts.hasPlatformAdmin) return "A platform admin logs in to this account. Suspending it would sign you out of this console.";
  if (org.stripeSubscriptionId) return "They pay through Stripe. Cancel the subscription in Stripe first, so they aren't charged for an account they can't open.";
  return null;
}
