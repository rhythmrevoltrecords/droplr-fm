-- Promo step reminders (so a nudge is never sent twice) and the shareable release report.
-- Idempotent: Netlify runs `prisma migrate deploy` on every build.

ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "reportToken" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "reportSharedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Release_reportToken_key" ON "Release"("reportToken");

CREATE TABLE IF NOT EXISTS "PromoStepReminder" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoStepReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PromoStepReminder_releaseId_key_key" ON "PromoStepReminder"("releaseId", "key");

DO $$ BEGIN
  ALTER TABLE "PromoStepReminder" ADD CONSTRAINT "PromoStepReminder_releaseId_fkey"
    FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
