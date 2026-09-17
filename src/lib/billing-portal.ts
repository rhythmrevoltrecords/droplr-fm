import type Stripe from "stripe";
import { accountKind, PLANS_FOR, type AccountKind } from "./plans";
import { getStripe, INTERVALS, isPaidTier, priceIdFor, type PaidTier } from "./stripe";

/**
 * Stripe's Dashboard only edits ONE (default) customer portal configuration, so its "switch plan" list
 * would show label plans to artists and artist plans to labels. We keep one extra configuration per
 * account kind, created through the API: plan list = that kind's prices only, every other setting
 * (cancel mode, proration, invoices, business profile) copied from the default one you edit in the Dashboard.
 * If anything fails we fall back to the default configuration, which is how it worked before.
 */
const cache = new Map<AccountKind, { at: number; id: string }>();
const TTL = 10 * 60_000;

const tiersFor = (kind: AccountKind): PaidTier[] => PLANS_FOR[kind].filter(isPaidTier);

async function productsFor(kind: AccountKind) {
  const byProduct = new Map<string, string[]>();
  for (const tier of tiersFor(kind)) {
    for (const interval of INTERVALS) {
      const id = priceIdFor(tier, interval);
      if (!id) continue;
      const price = await getStripe().prices.retrieve(id);
      const product = typeof price.product === "string" ? price.product : price.product.id;
      byProduct.set(product, [...(byProduct.get(product) ?? []), price.id]);
    }
  }
  return [...byProduct].map(([product, prices]) => ({ product, prices }));
}

function paramsFrom(base: Stripe.BillingPortal.Configuration, kind: AccountKind, products: { product: string; prices: string[] }[]): Stripe.BillingPortal.ConfigurationCreateParams {
  const f = base.features;
  const cancel = f.subscription_cancel;
  const update = f.subscription_update;
  return {
    name: `droplr ${kind} plans`,
    business_profile: {
      headline: base.business_profile.headline ?? "",
      ...(base.business_profile.privacy_policy_url ? { privacy_policy_url: base.business_profile.privacy_policy_url } : {}),
      ...(base.business_profile.terms_of_service_url ? { terms_of_service_url: base.business_profile.terms_of_service_url } : {}),
    },
    features: {
      customer_update: { enabled: f.customer_update.enabled, ...(f.customer_update.enabled ? { allowed_updates: f.customer_update.allowed_updates } : {}) },
      invoice_history: { enabled: f.invoice_history.enabled },
      payment_method_update: { enabled: f.payment_method_update.enabled },
      subscription_cancel: {
        enabled: cancel.enabled,
        mode: cancel.mode,
        proration_behavior: cancel.proration_behavior,
        ...(cancel.cancellation_reason?.enabled ? { cancellation_reason: { enabled: true, options: cancel.cancellation_reason.options } } : {}),
      },
      subscription_update: products.length
        ? { enabled: true, default_allowed_updates: ["price"], proration_behavior: update.proration_behavior, products }
        : { enabled: false },
    },
    metadata: { droplr_kind: kind },
  };
}

/** Configuration id for this account kind, or undefined to use Stripe's default configuration. */
export async function portalConfigurationFor(kind: string | null | undefined): Promise<string | undefined> {
  const k = accountKind(kind);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.id;
  try {
    const stripe = getStripe();
    const all = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
    const base = all.data.find((c) => c.is_default);
    if (!base) return undefined;
    const params = paramsFrom(base, k, await productsFor(k));
    const mine = all.data.find((c) => c.metadata?.droplr_kind === k);
    // Update every refresh so Dashboard edits to the default (and new price ids) carry over.
    const id = mine ? (await stripe.billingPortal.configurations.update(mine.id, params)).id : (await stripe.billingPortal.configurations.create(params)).id;
    cache.set(k, { at: Date.now(), id });
    return id;
  } catch (err) {
    console.error("[stripe portal config]", err);
    return undefined;
  }
}
