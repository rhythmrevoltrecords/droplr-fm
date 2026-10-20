-- The bio page's release block: which roster artist the page is for, and whether to show it.
--
-- Written by hand and idempotent, because Netlify runs `prisma migrate deploy` on every build.
-- Both columns nullable with no default. NULL on releaseBlock means "don't show it", so no
-- existing page starts publishing a release nobody chose to put there; turning it on writes 'on'.
-- The foreign key is ON DELETE SET NULL: taking someone off the roster must never remove their
-- public page, only unlink the release block from it.

ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "artistProfileId" TEXT;
ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "releaseBlock" TEXT;

CREATE INDEX IF NOT EXISTS "BioPage_artistProfileId_idx" ON "BioPage"("artistProfileId");

DO $$
BEGIN
  ALTER TABLE "BioPage"
    ADD CONSTRAINT "BioPage_artistProfileId_fkey"
    FOREIGN KEY ("artistProfileId") REFERENCES "Artist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
