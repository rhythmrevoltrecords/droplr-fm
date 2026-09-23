-- Imported fan contacts: addresses a label collected before droplr.
--
-- Its own table on purpose. Release-day sending reads "PreSave" scoped to a releaseId, so an
-- address in here cannot enter a release-day send however the import behaves. That separation
-- is the safety property, not a naming preference — don't "simplify" this into PreSave later.
--
-- Provenance columns are the point: consentSource/consentAt/consentNote record who consented,
-- when and to what, because under the Spam Act the sender carries that burden no matter which
-- tool the list came from.
CREATE TABLE IF NOT EXISTS "FanContact" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email"          TEXT NOT NULL,
  "name"           TEXT,
  "country"        TEXT,
  "timezone"       TEXT,
  "consentSource"  TEXT NOT NULL,
  "consentAt"      TIMESTAMP(3),
  "consentNote"    TEXT,
  "consentKind"    TEXT NOT NULL DEFAULT 'transactional',
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "importId"       TEXT NOT NULL,
  "importedBy"     TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FanContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FanContact_organizationId_email_key" ON "FanContact"("organizationId", "email");
CREATE INDEX IF NOT EXISTS "FanContact_organizationId_status_idx" ON "FanContact"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "FanContact_importId_idx" ON "FanContact"("importId");

DO $$ BEGIN
  ALTER TABLE "FanContact" ADD CONSTRAINT "FanContact_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
