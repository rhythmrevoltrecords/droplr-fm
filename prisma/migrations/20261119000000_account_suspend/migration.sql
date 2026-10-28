-- Suspending an account from the owner console. Additive only; idempotent.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "suspendedBy" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "suspendReason" TEXT;
