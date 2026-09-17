-- Artist accounts, fan news opt-in and release promo plans. Additive with defaults.

-- label = a label running a roster; artist = an independent artist running their own releases.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'label';

-- Separate, optional consent to hear about future releases and news (release-day consent only covers that release).
ALTER TABLE "PreSave" ADD COLUMN IF NOT EXISTS "newsConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PreSave" ADD COLUMN IF NOT EXISTS "newsConsentAt" TIMESTAMP(3);

-- Ticked steps of a release's promo plan.
CREATE TABLE IF NOT EXISTS "PromoTaskDone" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoTaskDone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PromoTaskDone_releaseId_key_key" ON "PromoTaskDone"("releaseId", "key");
DO $$ BEGIN
  ALTER TABLE "PromoTaskDone" ADD CONSTRAINT "PromoTaskDone_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
