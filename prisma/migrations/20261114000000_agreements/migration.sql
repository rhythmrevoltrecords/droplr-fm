-- Contracts: agreements kept next to the roster and the releases they cover. droplr stores a link
-- to the document, never the file. Additive only; idempotent.

CREATE TABLE IF NOT EXISTS "Agreement" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "artistId"         TEXT,
  "title"            TEXT NOT NULL,
  "kind"             TEXT NOT NULL DEFAULT 'recording',
  "status"           TEXT NOT NULL DEFAULT 'draft',
  "counterparty"     TEXT,
  "signedOn"         TIMESTAMP(3),
  "startsOn"         TIMESTAMP(3),
  "endsOn"           TIMESTAMP(3),
  "noticeDays"       INTEGER,
  "documentUrl"      TEXT,
  "termsNote"        TEXT,
  "notes"            TEXT,
  "noticeRemindedAt" TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Agreement" ADD COLUMN IF NOT EXISTS "noticeRemindedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Agreement_organizationId_idx" ON "Agreement"("organizationId");
CREATE INDEX IF NOT EXISTS "Agreement_artistId_idx" ON "Agreement"("artistId");
CREATE INDEX IF NOT EXISTS "Agreement_endsOn_idx" ON "Agreement"("endsOn");
DO $$ BEGIN
  ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AgreementRelease" (
  "id"          TEXT NOT NULL,
  "agreementId" TEXT NOT NULL,
  "releaseId"   TEXT NOT NULL,
  CONSTRAINT "AgreementRelease_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgreementRelease_agreementId_releaseId_key" ON "AgreementRelease"("agreementId", "releaseId");
CREATE INDEX IF NOT EXISTS "AgreementRelease_releaseId_idx" ON "AgreementRelease"("releaseId");
DO $$ BEGIN
  ALTER TABLE "AgreementRelease" ADD CONSTRAINT "AgreementRelease_agreementId_fkey"
    FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AgreementRelease" ADD CONSTRAINT "AgreementRelease_releaseId_fkey"
    FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
