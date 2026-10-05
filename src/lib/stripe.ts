import Stripe from "stripe";

let client: Stripe | null = null;

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Test-mode key (sk_test_…): the billing page shows the 4242 test card hint. */
export function stripeTestMode() {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}

/**
 * The Stripe API version this app is written against, pinned on purpose.
 *
 * Without this, `new Stripe(key)` falls back to whatever version the installed SDK pins
 * (`stripe.core.js`: `props.apiVersion || DEFAULT_API_VERSION`) and sends it as the `Stripe-Version`
 * header — so bumping the stripe package to a new major silently changes the API version that live
 * checkout, the customer portal, subscription reads and the webhook handler all talk to. That is a
 * billing change wearing a dependency bump's clothes.
 *
 * Pinning it here makes the two separate decisions: upgrading the SDK gets you new types and new
 * methods, and moving the API version is its own deliberate change with its own testing.
 *
 * This value is the one stripe-node 22.6.2 already sent, so setting it changes nothing today.
 *
 * **To move it:** read Stripe's upgrade notes for every version in between, check the objects this
 * app actually reads — `checkout.session`, `customer.subscription`, `price`, `coupon`,
 * `promotion_code` — then change it here and exercise a real checkout in Stripe test mode on a
 * deploy preview before it reaches main.
 *
 * The cast is deliberate: Stripe types `apiVersion` as the literal the *installed* SDK pins, so the
 * moment the package is upgraded past this version the literal stops matching. That mismatch is the
 * entire point of pinning, so it is asserted rather than chased.
 */
export const STRIPE_API_VERSION = "2026-08-26.dahlia";

/** Lazy so a missing STRIPE_SECRET_KEY never breaks the build or unrelated pages. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion });
  return client;
}

export function stripeId(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

/** Tiers a label can buy self-serve. Enterprise is sales-led (no Stripe price). */
export const PAID_TIERS = ["artist", "artist_pro", "pro", "label"] as const;
export type PaidTier = (typeof PAID_TIERS)[number];
export const isPaidTier = (t: unknown): t is PaidTier => typeof t === "string" && (PAID_TIERS as readonly string[]).includes(t);

export const INTERVALS = ["monthly", "yearly"] as const;
export type BillingInterval = (typeof INTERVALS)[number];
export const isInterval = (i: unknown): i is BillingInterval => i === "monthly" || i === "yearly";

/**
 * Netlify env names: STRIPE_PRO_MONTHLY_PRICE_ID, STRIPE_PRO_YEARLY_PRICE_ID,
 * STRIPE_LABEL_MONTHLY_PRICE_ID, STRIPE_LABEL_YEARLY_PRICE_ID, STRIPE_ARTIST_MONTHLY_PRICE_ID, STRIPE_ARTIST_YEARLY_PRICE_ID,
 * STRIPE_ARTIST_PRO_MONTHLY_PRICE_ID, STRIPE_ARTIST_PRO_YEARLY_PRICE_ID.
 * STRIPE_<TIER>_PRICE_ID is accepted as a monthly fallback.
 */
export function priceIdFor(tier: PaidTier, interval: BillingInterval): string | null {
  const T = tier.toUpperCase();
  const I = interval.toUpperCase();
  return process.env[`STRIPE_${T}_${I}_PRICE_ID`] || (interval === "monthly" ? process.env[`STRIPE_${T}_PRICE_ID`] : undefined) || null;
}

/** Reverse lookup so plan changes made in the Stripe customer portal map back to a tier. */
export function tierForPrice(priceId: string | null | undefined): { tier: PaidTier; interval: BillingInterval } | null {
  if (!priceId) return null;
  for (const tier of PAID_TIERS) for (const interval of INTERVALS) if (priceIdFor(tier, interval) === priceId) return { tier, interval };
  return null;
}
