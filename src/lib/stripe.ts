import Stripe from "stripe";

// Created on first use, never at import time: a missing STRIPE_SECRET_KEY must not break the build
// ("Failed to collect page data") or crash unrelated pages. Routes check stripeConfigured() first.
let client: Stripe | null = null;

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key);
  return client;
}

/** Stripe ids arrive as string | expanded object | null. */
export function stripeId(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

export const PAID_TIERS = ["pro", "label", "enterprise"] as const;
export type PaidTier = (typeof PAID_TIERS)[number];
export const isPaidTier = (t: unknown): t is PaidTier => typeof t === "string" && (PAID_TIERS as readonly string[]).includes(t);
