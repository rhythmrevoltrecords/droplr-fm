-- One open Stripe Checkout per organisation.
--
-- The "already subscribed → portal" guard only works once a subscription id is saved, which happens
-- after payment. Two Checkout tabs (or an owner and an admin at the same time) could both complete and
-- leave one org paying for two subscriptions; cancelling the one droplr tracked then dropped the plan
-- while the other kept charging. The checkout route now expires the previous open session before
-- creating a new one, and this column is how it finds it. Nullable, no backfill.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "stripeCheckoutSessionId" TEXT;
