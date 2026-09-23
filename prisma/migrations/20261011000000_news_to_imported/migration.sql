-- Let a news send reach an imported contact.
--
-- NewsEmailDelivery.preSaveId was NOT NULL, and the unsubscribe token is built from it. An
-- imported contact deliberately has no PreSave row (that is what keeps imports out of the
-- release-day pipeline), so it could never appear here. Now exactly one of the two ids is set
-- and the unsubscribe link resolves against whichever it is.
ALTER TABLE "NewsEmailDelivery" ALTER COLUMN "preSaveId" DROP NOT NULL;
ALTER TABLE "NewsEmailDelivery" ADD COLUMN IF NOT EXISTS "fanContactId" TEXT;
CREATE INDEX IF NOT EXISTS "NewsEmailDelivery_fanContactId_idx" ON "NewsEmailDelivery"("fanContactId");
