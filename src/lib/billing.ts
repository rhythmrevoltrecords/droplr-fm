import type Stripe from "stripe";
import { prisma } from "./db";
import { higherPlan } from "./plans";
import { getStripe, isPaidTier, priceIdFor, stripeConfigured, stripeId, tierForPrice, type BillingInterval, type PaidTier } from "./stripe";

/** Stripe statuses that keep paid features on. past_due = Stripe is still retrying the card. */
const KEEPS_PLAN = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

/**
 * Single place that turns a Stripe subscription into Organization.plan.
 * Used by the webhook and by the checkout success redirect (so the upgrade shows
 * immediately even if the webhook is slow). Idempotent.
 */
export async function applySubscription(orgId: string, sub: Stripe.Subscription) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, stripeSubscriptionId: true, compPlan: true } });
  if (!org) return null;
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const tier = tierForPrice(priceId)?.tier ?? (isPaidTier(sub.metadata?.tier) ? sub.metadata.tier : null);
  const ended = sub.status === "canceled" || sub.status === "incomplete_expired" || sub.status === "unpaid";
  // A late event for an old, ended subscription must not wipe a newer one.
  if (ended && org.stripeSubscriptionId && org.stripeSubscriptionId !== sub.id) return null;
  // A complimentary plan is a floor: Stripe can only raise it.
  const plan = higherPlan(KEEPS_PLAN.has(sub.status) && tier ? tier : "free", org.compPlan);
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

const isMissing = (err: unknown) => (err as { code?: string })?.code === "resource_missing";

/**
 * Stripe ids saved while the site ran on sandbox keys don't exist in live mode (and vice versa).
 * If the stored customer or subscription is gone from the current Stripe account, forget them and
 * drop the plan back to Free (or the complimentary plan), so the label can check out again.
 * Returns true if anything was cleared. Other Stripe errors (network, rate limit) change nothing.
 */
export async function clearStaleStripeIds(org: { id: string; stripeCustomerId: string | null; stripeSubscriptionId: string | null; compPlan: string | null }) {
  if (!stripeConfigured() || (!org.stripeCustomerId && !org.stripeSubscriptionId)) return false;
  const stripe = getStripe();
  let stale = false;
  try {
    if (org.stripeSubscriptionId) await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
    else if (org.stripeCustomerId) await stripe.customers.retrieve(org.stripeCustomerId);
  } catch (err) {
    stale = isMissing(err);
  }
  if (!stale && org.stripeSubscriptionId && org.stripeCustomerId) {
    try {
      await stripe.customers.retrieve(org.stripeCustomerId);
    } catch (err) {
      stale = isMissing(err);
    }
  }
  if (!stale) return false;
  await prisma.organization.update({
    where: { id: org.id },
    data: { stripeCustomerId: null, stripeSubscriptionId: null, stripePriceId: null, plan: higherPlan("free", org.compPlan), planUpdatedAt: new Date() },
  });
  console.warn("[billing] cleared Stripe ids not found in this Stripe account", org.id);
  return true;
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
  const table: PriceTable = { artist: { monthly: null, yearly: null }, artist_pro: { monthly: null, yearly: null }, pro: { monthly: null, yearly: null }, label: { monthly: null, yearly: null } };
  if (!stripeConfigured()) return table;
  const jobs: Promise<void>[] = [];
  for (const tier of ["artist", "artist_pro", "pro", "label"] as const) {
    for (const interval of ["monthly", "yearly"] as const) {
      const id = priceIdFor(tier, interval);
      if (!id) continue;
      jobs.push(
        getStripe().prices.retrieve(id).then(
          (p) => { table[tier][interval] = { id: p.id, amount: p.unit_amount, currency: p.currency, interval: p.recurring?.interval ?? null }; },
          () => { table[tier][interval] = { id, amount: null, currency: "aud", interval: null }; },
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
  // "$29 AUD": symbol plus code, so overseas labels don't read AUD as USD.
  return `${new Intl.NumberFormat("en-AU", { style: "currency", currency: currency.toUpperCase(), currencyDisplay: "narrowSymbol", minimumFractionDigits: n % 1 ? 2 : 0 }).format(n)} ${currency.toUpperCase()}`;
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
      amount: formatMoney(item?.price?.unit_amount ?? null, item?.price?.currency ?? "aud"),
    };
  } catch {
    return null;
  }
}

/**
 * The comp a account is actually entitled to right now. A comp whose compUntil has passed grants
 * nothing, so recomputing a plan never re-grants a lapsed comp. Null compUntil means no end date.
 *
 * Enforcement is the sweep below, which runs with the release check: the stored `plan` column is what
 * gates features everywhere, so a lapsed comp can linger for up to one job interval. That is fine —
 * this is a generosity switch, not a security boundary.
 */
export function effectiveComp(org: { compPlan: string | null; compUntil?: Date | null }, now = new Date()) {
  if (!org.compPlan) return null;
  if (org.compUntil && org.compUntil.getTime() <= now.getTime()) return null;
  return org.compPlan;
}

/**
 * Plan implied by what's stored (no Stripe call): the subscription's tier if one is on file, else free,
 * raised to the complimentary plan if one is set and still running. Used when a comp is added or removed.
 */
export function storedPlan(org: { stripeSubscriptionId: string | null; stripePriceId: string | null; compPlan: string | null; compUntil?: Date | null }) {
  const paid = org.stripeSubscriptionId ? tierForPrice(org.stripePriceId)?.tier ?? null : null;
  return higherPlan(paid ?? "free", effectiveComp(org));
}

/**
 * Drop accounts whose complimentary plan has lapsed back to what they actually pay for. Leaves
 * compPlan/compUntil in place so the dashboard can say the comp ended and what happens next.
 * Returns how many were changed.
 */
export async function sweepLapsedComps(now = new Date()) {
  const { prisma } = await import("./db");
  const lapsed = await prisma.organization.findMany({
    where: { compPlan: { not: null }, compUntil: { not: null, lte: now } },
    select: { id: true, plan: true, stripeSubscriptionId: true, stripePriceId: true, compPlan: true, compUntil: true },
  });
  let changed = 0;
  for (const org of lapsed) {
    const next = storedPlan(org);
    if (next === org.plan) continue;
    await prisma.organization.update({ where: { id: org.id }, data: { plan: next, planUpdatedAt: now } });
    changed++;
  }
  return changed;
}
