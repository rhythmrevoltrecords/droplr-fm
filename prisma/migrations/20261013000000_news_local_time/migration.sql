-- Release-day emails already land at the fan's own 9am. News emails were a single global instant,
-- so 9am Brisbane was midnight in the UK. A news email can now do the same per-timezone send.
ALTER TABLE "NewsEmail" ADD COLUMN IF NOT EXISTS "sendMode" TEXT NOT NULL DEFAULT 'instant';
ALTER TABLE "NewsEmail" ADD COLUMN IF NOT EXISTS "localHour" INTEGER;

-- Computed once per recipient at snapshot, so the send loop only ever compares timestamps.
ALTER TABLE "NewsEmailDelivery" ADD COLUMN IF NOT EXISTS "sendAfter" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "NewsEmailDelivery_newsEmailId_sendAfter_idx" ON "NewsEmailDelivery"("newsEmailId", "sendAfter");
