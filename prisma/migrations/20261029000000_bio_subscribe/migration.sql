-- A subscribe button on a bio page, and the fan rows it captures.
--
-- Written by hand and idempotent, because Netlify runs `prisma migrate deploy` on every build.
--
-- BioPage.subscribe is opt-in and NULL by default, the same decision as releaseBlock: a column
-- that defaulted to "show" would put a form asking for email addresses onto every existing
-- public page without the account holder ever choosing to collect them. New pages are created
-- from a form that shows the switch, so nobody gets it by surprise.
--
-- FanContact.importId becomes nullable. Until now every row in that table came from a bulk
-- import and the column grouped the batch. A fan who typed their address into a page belongs to
-- no batch, and a sentinel value would have made importedSummary count them as an import.
--
-- consentVersion is the discipline PreSave already has: a consent flag with no version cannot
-- answer "what did this person actually agree to". Imported rows keep NULL, because the importer
-- attested to wording droplr never showed.
--
-- bioPageId is ON DELETE SET NULL. Deleting a page must never delete the fans it collected --
-- those addresses are the account's, and the page is just where they arrived.

ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "subscribe" TEXT;
ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "subscribeText" TEXT;

ALTER TABLE "FanContact" ALTER COLUMN "importId" DROP NOT NULL;
ALTER TABLE "FanContact" ADD COLUMN IF NOT EXISTS "consentVersion" TEXT;
ALTER TABLE "FanContact" ADD COLUMN IF NOT EXISTS "bioPageId" TEXT;

CREATE INDEX IF NOT EXISTS "FanContact_bioPageId_idx" ON "FanContact"("bioPageId");

DO $$
BEGIN
  ALTER TABLE "FanContact"
    ADD CONSTRAINT "FanContact_bioPageId_fkey"
    FOREIGN KEY ("bioPageId") REFERENCES "BioPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The index the news audience query leans on: "is this contact mailable, and where did it come
-- from". consentSource is in it because the page-captured carve-out filters on exactly that.
CREATE INDEX IF NOT EXISTS "FanContact_org_source_status_idx"
  ON "FanContact"("organizationId", "consentSource", "status");
