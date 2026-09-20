-- Complimentary plans gain an end date, the price that follows, and per-grant notice tracking.
-- Idempotent: Netlify runs `prisma migrate deploy` on every build.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "compUntil" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "founderPrice" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "compNoticeAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "compEndedNoticeAt" TIMESTAMP(3);

-- Comps that already exist have no end date, which is what null already means. Nothing to backfill.
