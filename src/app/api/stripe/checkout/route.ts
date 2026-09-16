import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getCurrentUser } from '@/lib/auth';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' as any });
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const tier = body.tier || 'pro';
  const priceId = body.priceId || (tier === 'label' ? process.env.STRIPE_LABEL_PRICE_ID : process.env.STRIPE_PRO_PRICE_ID);
  if (!priceId) return NextResponse.json({ error: 'Missing STRIPE_PRO_PRICE_ID' }, { status: 400 });
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    client_reference_id: user.organizationId,
    customer_email: user.email,
    metadata: { organizationId: user.organizationId, tier },
    subscription_data: { metadata: { organizationId: user.organizationId, tier } },
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `https://droplr.fm/dashboard?upgraded=1`,
    cancel_url: `https://droplr.fm/pricing?canceled=1`,
  });
  return NextResponse.json({ url: session.url });
}
