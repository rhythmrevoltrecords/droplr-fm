import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/env";
import { getStripe, isPaidTier, stripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const PRICE_ENV: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRO_PRICE_ID,
  label: process.env.STRIPE_LABEL_PRICE_ID,
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID,
};

/** Start a subscription checkout for the logged-in label owner/admin. */
export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!stripeConfigured()) return NextResponse.json({ error: "Billing isn't configured yet" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { tier?: string };
  const tier = isPaidTier(body.tier) ? body.tier : "pro";
  // Price comes from server env only — never trust a priceId from the browser.
  const priceId = PRICE_ENV[tier];
  if (!priceId) return NextResponse.json({ error: `Missing price for ${tier}` }, { status: 400 });

  const org = user.organization;
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    client_reference_id: org.id,
    ...(org.stripeCustomerId ? { customer: org.stripeCustomerId } : { customer_email: user.email }),
    metadata: { organizationId: org.id, tier },
    subscription_data: { metadata: { organizationId: org.id, tier } },
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${SITE_URL}/admin?upgraded=1`,
    cancel_url: `${SITE_URL}/pricing?canceled=1`,
  });
  return NextResponse.json({ url: session.url });
}
