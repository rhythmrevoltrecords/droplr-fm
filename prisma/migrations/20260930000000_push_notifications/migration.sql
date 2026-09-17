-- Push notifications for the installable dashboard app. Additive.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pushPrefs" JSONB;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "liveNotifiedAt" TIMESTAMP(3);
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "presaveMilestoneNotified" INTEGER NOT NULL DEFAULT 0;
-- Releases already out shouldn't announce "is live" when this ships.
UPDATE "Release" SET "liveNotifiedAt" = CURRENT_TIMESTAMP WHERE "releaseDate" < CURRENT_TIMESTAMP AND "liveNotifiedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "label" TEXT,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");
DO $$ BEGIN
  ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
