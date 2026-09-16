import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/env";
import { getStripe, stripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** POST → { url } for the Stripe customer portal (card, invoices, cancel, switch plan). */
export async function POST() {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!stripeConfigured()) return NextResponse.json({ error: "Billing isn't configured yet" }, { status: 503 });
  const customer = user.organization.stripeCustomerId;
  if (!customer) return NextResponse.json({ error: "No billing account yet. Upgrade first." }, { status: 400 });
  try {
    const portal = await getStripe().billingPortal.sessions.create({ customer, return_url: `${SITE_URL}/admin/settings/billing` });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    const hint = /configuration/i.test(msg) ? " Turn on the customer portal in Stripe → Settings → Billing → Customer portal." : "";
    // The real reason (and the setup hint) is for us, not for the label.
    console.error("[stripe portal]", err, hint);
    return NextResponse.json({ error: "Billing is temporarily unavailable. Try again, or email billing@droplr.fm." }, { status: 502 });
  }
}
