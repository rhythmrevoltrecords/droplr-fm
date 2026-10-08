import { prisma } from "@/lib/db";
import { getStripe, stripeConfigured, stripeId } from "@/lib/stripe";

/**
 * Closing an account.
 *
 * The rule this file exists to enforce: **leaving is not a funnel**. There is one confirmation,
 * it says what actually breaks, and the fan list downloads on every plan including Free. droplr's
 * whole argument is that an acquisition or a shutdown leaves artists with a working redirect and no
 * data; a close-account flow that hides the export behind a paid plan would make that a slogan.
 *
 * On the export gate specifically: `csvExport` is false on Free, and this flow ignores it. That is
 * not a hole in the gate, because the gate was never hiding the data — every address is visible on
 * the Free fan list and always has been, and the paid part is the convenience of a file. At the
 * moment someone leaves, charging for the convenience is the behaviour droplr exists to argue with.
 */

/** Typed confirmation. Compared loosely so a trailing space or a capital doesn't read as a refusal. */
export const closeConfirmationMatches = (typed: string, accountName: string) =>
  typed.trim().toLowerCase() === accountName.trim().toLowerCase() && accountName.trim().length > 0;

export type CloseSummary = {
  releases: number;
  fans: number;
  artists: number;
  links: number;
  customDomain: string | null;
  subscription: boolean;
};

/** What the person is about to lose, counted rather than described. */
export async function closeSummary(organizationId: string): Promise<CloseSummary> {
  // Fans are distinct emails across PreSave, not a table of their own — same shape fanSummary uses,
  // so the number here is the number on the fans page rather than a second, differently-wrong count.
  const [org, releases, fanRows, artists, links] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { customDomain: true, stripeSubscriptionId: true } }),
    prisma.release.count({ where: { organizationId } }),
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(DISTINCT lower(p.email)) AS total
      FROM "PreSave" p JOIN "Release" r ON r.id = p."releaseId"
      WHERE r."organizationId" = ${organizationId} AND p.email IS NOT NULL`,
    prisma.artist.count({ where: { organizationId } }),
    prisma.releaseLink.count({ where: { release: { organizationId } } }),
  ]);
  const fans = Number(fanRows[0]?.total ?? 0);
  return {
    releases, fans, artists, links,
    customDomain: org?.customDomain ?? null,
    subscription: Boolean(org?.stripeSubscriptionId),
  };
}

/**
 * Cancel the Stripe subscription **now**, not at period end.
 *
 * At period end would be the kinder-sounding default and the wrong one here: the account is about
 * to stop existing, so a subscription outliving it bills a customer whose data we deleted, and the
 * webhook that would normally reconcile it has nothing left to write to.
 *
 * A failure here must not stop the deletion. Someone who asked to leave does not get told "no"
 * because Stripe timed out — it is logged, and an orphan subscription is a thing a human can fix,
 * whereas a half-deleted account is not.
 */
async function cancelSubscription(subscriptionId: string | null): Promise<"cancelled" | "none" | "failed"> {
  if (!subscriptionId || !stripeConfigured()) return "none";
  try {
    await getStripe().subscriptions.cancel(subscriptionId);
    return "cancelled";
  } catch (e) {
    console.error("[account-close] could not cancel subscription", subscriptionId, e);
    return "failed";
  }
}

/**
 * Delete the organisation and everything hanging off it.
 *
 * Every org-scoped model cascades from Organization except `WaitlistFeature`, which carries an
 * `organizationId` with no foreign key behind it — so it would quietly survive the delete and leave
 * rows pointing at an organisation that no longer exists. It is removed by hand, first, inside the
 * same transaction. **If another model is ever given an organizationId without a relation, it
 * belongs in this list**; `test:security` asserts the list is complete.
 */
export async function closeAccount(organizationId: string): Promise<{ subscription: "cancelled" | "none" | "failed" }> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeSubscriptionId: true },
  });
  const subscription = await cancelSubscription(stripeId(org?.stripeSubscriptionId));

  await prisma.$transaction([
    prisma.waitlistFeature.deleteMany({ where: { organizationId } }),
    prisma.organization.delete({ where: { id: organizationId } }),
  ]);

  return { subscription };
}
