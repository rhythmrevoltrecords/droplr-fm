import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/env";
import { clearStaleStripeIds } from "@/lib/billing";
import { accountKind, PLANS_FOR } from "@/lib/plans";
import { getStripe, isInterval, isPaidTier, priceIdFor, stripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const BILLING = `${SITE_URL}/admin/settings/billing`;

/** POST { tier: "pro" | "label", interval: "monthly" | "yearly" } → { url } (Stripe Checkout, or the portal if already subscribed). */
export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { tier?: unknown; interval?: unknown };
  if (!isPaidTier(body.tier)) return NextResponse.json({ error: "Choose a paid plan" }, { status: 400 });
  // Artist accounts buy Artist; label accounts buy Pro or Label.
  if (!PLANS_FOR[accountKind(user.organization.kind)].includes(body.tier)) return NextResponse.json({ error: "That plan isn't available for this account" }, { status: 400 });
  if (!stripeConfigured()) return NextResponse.json({ error: "Billing isn't configured yet" }, { status: 503 });
  const interval = isInterval(body.interval) ? body.interval : "monthly";
  const priceId = priceIdFor(body.tier, interval);
  if (!priceId) return NextResponse.json({ error: `The ${body.tier} ${interval} price isn't set up yet` }, { status: 503 });

  const org = user.organization;
  try {
    // Sandbox-era ids aren't valid on live keys: forget them so this becomes a normal checkout.
    if (await clearStaleStripeIds(org)) Object.assign(org, { stripeCustomerId: null, stripeSubscriptionId: null, stripePriceId: null });
    // Already subscribed: plan changes go through the portal so nobody ends up with two subscriptions.
    if (org.stripeSubscriptionId && org.stripeCustomerId) {
      const portal = await getStripe().billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: BILLING });
      return NextResponse.json({ url: portal.url, portal: true });
    }

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      client_reference_id: org.id,
      ...(org.stripeCustomerId ? { customer: org.stripeCustomerId } : { customer_email: user.email }),
      metadata: { organizationId: org.id, tier: body.tier, interval },
      subscription_data: { metadata: { organizationId: org.id, tier: body.tier, interval } },
      line_items: [{ price: priceId, quantity: 1 }],
      // Link (Stripe Managed Payments) is merchant of record: it collects tax, sends receipts and handles disputes.
      // Sandbox turns this on by default; live mode needs it on every session. STRIPE_MANAGED_PAYMENTS=false opts out.
      ...(process.env.STRIPE_MANAGED_PAYMENTS === "false" ? {} : { managed_payments: { enabled: true } }),
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${BILLING}?upgraded=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BILLING}?canceled=1`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Stripe error text can include ids and account config: log it, don't show it.
    console.error("[stripe checkout]", err);
    return NextResponse.json({ error: "Billing is temporarily unavailable. Try again, or email billing@droplr.fm." }, { status: 502 });
  }
}
