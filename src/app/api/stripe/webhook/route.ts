import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { applySubscription, orgIdForSubscription } from "@/lib/billing";
import { prisma } from "@/lib/db";
import { getStripe, stripeConfigured, stripeId } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Stripe → droplr.fm. Endpoint: https://droplr.fm/api/stripe/webhook
 * Events: checkout.session.completed, customer.subscription.created,
 * customer.subscription.updated, customer.subscription.deleted
 */
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret || !stripeConfigured()) return new NextResponse("Missing secret", { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await req.text(), sig, secret);
  } catch (err) {
    return new NextResponse(`Webhook Error: ${err instanceof Error ? err.message : "invalid signature"}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const orgId = s.client_reference_id ?? s.metadata?.organizationId ?? null;
        const subId = stripeId(s.subscription);
        if (!orgId || !(await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } }))) break;
        if (subId) await applySubscription(orgId, await getStripe().subscriptions.retrieve(subId));
        else await prisma.organization.update({ where: { id: orgId }, data: { stripeCustomerId: stripeId(s.customer) } });
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const eventSub = event.data.object as Stripe.Subscription;
        // Stripe doesn't guarantee delivery order: apply the subscription as it is now, not as it was
        // when this (possibly stale or retried) event was created. Deleted subs may be gone: use the event copy.
        const sub = await getStripe().subscriptions.retrieve(eventSub.id).catch((err: { code?: string }) => {
          if (err?.code === "resource_missing") return eventSub;
          throw err;
        });
        const orgId = await orgIdForSubscription(sub);
        if (orgId) await applySubscription(orgId, sub);
        break;
      }
    }
  } catch (err) {
    // 500 makes Stripe retry, which is what we want for a transient DB error.
    console.error("[stripe webhook]", event.type, err);
    return new NextResponse("Handler error", { status: 500 });
  }

  return NextResponse.json({ received: true });
}
