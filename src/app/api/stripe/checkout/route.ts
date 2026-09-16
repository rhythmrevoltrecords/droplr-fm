import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/env";
import { getStripe, isInterval, isPaidTier, priceIdFor, stripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const BILLING = `${SITE_URL}/admin/settings/billing`;

/** POST { tier: "pro" | "label", interval: "monthly" | "yearly" } → { url } (Stripe Checkout, or the portal if already subscribed). */
export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!stripeConfigured()) return NextResponse.json({ error: "Billing isn't configured yet" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { tier?: unknown; interval?: unknown };
  if (!isPaidTier(body.tier)) return NextResponse.json({ error: "Choose Pro or Label" }, { status: 400 });
  const interval = isInterval(body.interval) ? body.interval : "monthly";
  const priceId = priceIdFor(body.tier, interval);
  if (!priceId) return NextResponse.json({ error: `The ${body.tier} ${interval} price isn't set up yet` }, { status: 503 });

  const org = user.organization;
  try {
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
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      custom_text: {
        submit: { message: `By subscribing you agree to the droplr.fm Terms of Service and Billing & Refund Policy (${SITE_URL}/legal). Renews automatically until cancelled.` },
      },
      success_url: `${BILLING}?upgraded=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BILLING}?canceled=1`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe checkout]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Stripe error" }, { status: 502 });
  }
}
