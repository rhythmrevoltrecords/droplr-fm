import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/db';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' as any });
export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return new NextResponse('Missing secret', { status: 400 });
  let event: Stripe.Event;
  try {
    const raw = await req.text();
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err: any) {
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as Stripe.Checkout.Session;
    const orgId = s.client_reference_id || (s.metadata as any)?.organizationId;
    const tier = (s.metadata as any)?.tier || 'pro';
    if (orgId) {
      await prisma.organization.update({ where: { id: orgId }, data: { plan: tier, stripeCustomerId: s.customer as string, stripeSubscriptionId: s.subscription as string } as any });
    }
  }
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const orgId = (sub.metadata as any)?.organizationId;
    if (orgId) await prisma.organization.update({ where: { id: orgId }, data: { plan: 'free' } });
  }
  return NextResponse.json({ received: true });
}
