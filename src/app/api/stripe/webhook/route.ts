import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getStripe, isPaidTier, stripeConfigured, stripeId } from "@/lib/stripe";

export const dynamic = "force-dynamic";

async function orgExists(id: string | null | undefined) {
  if (!id) return null;
  return prisma.organization.findUnique({ where: { id }, select: { id: true } });
}

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

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    const org = await orgExists(s.client_reference_id ?? s.metadata?.organizationId);
    const tier = isPaidTier(s.metadata?.tier) ? s.metadata!.tier : "pro";
    if (org) {
      await prisma.organization.update({
        where: { id: org.id },
        data: { plan: tier, stripeCustomerId: stripeId(s.customer), stripeSubscriptionId: stripeId(s.subscription), planUpdatedAt: new Date() },
      });
    }
  }

  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    const org = await orgExists(sub.metadata?.organizationId);
    if (org) {
      const active = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
      const tier = isPaidTier(sub.metadata?.tier) ? sub.metadata!.tier : "pro";
      await prisma.organization.update({
        where: { id: org.id },
        data: {
          plan: active ? tier : "free",
          stripeSubscriptionId: sub.id,
          stripePriceId: sub.items?.data?.[0]?.price?.id ?? null,
          planUpdatedAt: new Date(),
        },
      });
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const org = await orgExists(sub.metadata?.organizationId);
    if (org) await prisma.organization.update({ where: { id: org.id }, data: { plan: "free", stripeSubscriptionId: null, stripePriceId: null, planUpdatedAt: new Date() } });
  }

  return NextResponse.json({ received: true });
}
