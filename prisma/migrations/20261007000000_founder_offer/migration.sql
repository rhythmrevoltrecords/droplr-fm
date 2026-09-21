-- A founding rate can now carry a deadline to claim it, and the promo code that applies it.
-- Idempotent: Netlify runs `prisma migrate deploy` on every build.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "founderOfferUntil" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "founderCode" TEXT;
