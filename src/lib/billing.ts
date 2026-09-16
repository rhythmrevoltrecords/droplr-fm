import type Stripe from "stripe";
import { prisma } from "./db";
import { getStripe, isPaidTier, priceIdFor, stripeConfigured, stripeId, tierForPrice, type BillingInterval, type PaidTier } from "./stripe";

/** Stripe statuses that keep paid features on. past_due = Stripe is still retrying the card. */
const KEEPS_PLAN = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

/**
 * Single place that turns a Stripe subscription into Organization.plan.
 * Used by the webhook and by the checkout success redirect (so the upgrade shows
 * immediately even if the webhook is slow). Idempotent.
 */
export async function applySubscription(orgId: string, sub: Stripe.Subscription) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, stripeSubscriptionId: true } });
  if (!org) return null;
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const tier = tierForPrice(priceId)?.tier ?? (isPaidTier(sub.metadata?.tier) ? sub.metadata.tier : null);
  const ended = sub.status === "canceled" || sub.status === "incomplete_expired" || sub.status === "unpaid";
  // A late event for an old, ended subscription must not wipe a newer one.
  if (ended && org.stripeSubscriptionId && org.stripeSubscriptionId !== sub.id) return null;
  const plan = KEEPS_PLAN.has(sub.status) && tier ? tier : "free";
  // "incomplete" = first payment not finished yet: record ids but don't grant or revoke anything.
  if (sub.status === "incomplete") {
    return prisma.organization.update({ where: { id: org.id }, data: { stripeCustomerId: stripeId(sub.customer), stripeSubscriptionId: sub.id } });
  }
  return prisma.organization.update({
    where: { id: org.id },
    data: {
      plan,
      stripeCustomerId: stripeId(sub.customer),
      stripeSubscriptionId: ended ? null : sub.id,
      stripePriceId: ended ? null : priceId,
      planUpdatedAt: new Date(),
    },
  });
}

/** Find the org for a subscription: metadata first, then the stored customer id. */
export async function orgIdForSubscription(sub: Stripe.Subscription) {
  const metaId = sub.metadata?.organizationId;
  if (metaId && (await prisma.organization.findUnique({ where: { id: metaId }, select: { id: true } }))) return metaId;
  const customer = stripeId(sub.customer);
  if (!customer) return null;
  const org = await prisma.organization.findUnique({ where: { stripeCustomerId: customer }, select: { id: true } });
  return org?.id ?? null;
}

export type PriceInfo = { id: string; amount: number | null; currency: string; interval: string | null };
export type PriceTable = Record<PaidTier, Record<BillingInterval, PriceInfo | null>>;

let priceCache: { at: number; table: PriceTable } | null = null;

/** Live amounts from Stripe (10-minute cache). Missing env or a Stripe error → null for that slot. */
export async function getPriceTable(): Promise<PriceTable> {
  if (priceCache && Date.now() - priceCache.at < 10 * 60_000) return priceCache.table;
  const table: PriceTable = { pro: { monthly: null, yearly: null }, label: { monthly: null, yearly: null } };
  if (!stripeConfigured()) return table;
  const jobs: Promise<void>[] = [];
  for (const tier of ["pro", "label"] as const) {
    for (const interval of ["monthly", "yearly"] as const) {
      const id = priceIdFor(tier, interval);
      if (!id) continue;
      jobs.push(
        getStripe().prices.retrieve(id).then(
          (p) => { table[tier][interval] = { id: p.id, amount: p.unit_amount, currency: p.currency, interval: p.recurring?.interval ?? null }; },
          () => { table[tier][interval] = { id, amount: null, currency: "usd", interval: null }; },
        ),
      );
    }
  }
  await Promise.all(jobs);
  priceCache = { at: Date.now(), table };
  return table;
}

export function formatMoney(amount: number | null, currency: string) {
  if (amount == null) return null;
  const n = amount / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: n % 1 ? 2 : 0 }).format(n) + (currency.toLowerCase() === "usd" ? " USD" : "");
}

export type SubscriptionSummary = {
  status: Stripe.Subscription.Status;
  cancelAtPeriodEnd: boolean;
  periodEnd: Date | null;
  interval: BillingInterval | null;
  amount: string | null;
};

export async function getSubscriptionSummary(subscriptionId: string | null): Promise<SubscriptionSummary | null> {
  if (!subscriptionId || !stripeConfigured()) return null;
  try {
    const sub = await getStripe().subscriptions.retrieve(subscriptionId);
    const item = sub.items.data[0];
    const end = item?.current_period_end ?? sub.cancel_at ?? null;
    return {
      status: sub.status,
      cancelAtPeriodEnd: sub.cancel_at_period_end || !!sub.cancel_at,
      periodEnd: end ? new Date(end * 1000) : null,
      interval: tierForPrice(item?.price?.id)?.interval ?? (item?.price?.recurring?.interval === "year" ? "yearly" : item?.price?.recurring?.interval === "month" ? "monthly" : null),
      amount: formatMoney(item?.price?.unit_amount ?? null, item?.price?.currency ?? "usd"),
    };
  } catch {
    return null;
  }
}
