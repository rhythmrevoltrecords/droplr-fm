-- Royalties and splits: split sheets confirmed by each party, imported distributor statements
-- (totals per release only, never the statement's lines) and what each party is owed from each.
-- droplr tracks this and never holds or moves money. Additive only; idempotent.

CREATE TABLE IF NOT EXISTS "SplitSheet" (
  "id"             TEXT NOT NULL,
  "releaseId"      TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "version"        INTEGER NOT NULL DEFAULT 1,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SplitSheet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SplitSheet_releaseId_key" ON "SplitSheet"("releaseId");
CREATE INDEX IF NOT EXISTS "SplitSheet_organizationId_idx" ON "SplitSheet"("organizationId");

CREATE TABLE IF NOT EXISTS "SplitParty" (
  "id"               TEXT NOT NULL,
  "sheetId"          TEXT NOT NULL,
  "position"         INTEGER NOT NULL DEFAULT 0,
  "name"             TEXT NOT NULL,
  "email"            TEXT,
  "role"             TEXT NOT NULL DEFAULT 'artist',
  "shareBps"         INTEGER NOT NULL,
  "tokenHash"        TEXT,
  "tokenExpiresAt"   TIMESTAMP(3),
  "sentAt"           TIMESTAMP(3),
  "sentVersion"      INTEGER,
  "confirmedVersion" INTEGER,
  "confirmedAt"      TIMESTAMP(3),
  "disputedVersion"  INTEGER,
  "disputedAt"       TIMESTAMP(3),
  "disputeNote"      TEXT,
  CONSTRAINT "SplitParty_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SplitParty_tokenHash_key" ON "SplitParty"("tokenHash");
CREATE INDEX IF NOT EXISTS "SplitParty_sheetId_idx" ON "SplitParty"("sheetId");

CREATE TABLE IF NOT EXISTS "StatementImport" (
  "id"              TEXT NOT NULL,
  "organizationId"  TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "currency"        TEXT NOT NULL,
  "periodStart"     TIMESTAMP(3),
  "periodEnd"       TIMESTAMP(3),
  "rowsTotal"       INTEGER NOT NULL,
  "rowsMatched"     INTEGER NOT NULL,
  "matchedMicros"   BIGINT NOT NULL,
  "unmatchedMicros" BIGINT NOT NULL,
  "unmatched"       JSONB NOT NULL,
  "calculatedAt"    TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StatementImport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StatementImport_organizationId_idx" ON "StatementImport"("organizationId");

CREATE TABLE IF NOT EXISTS "StatementLine" (
  "id"           TEXT NOT NULL,
  "importId"     TEXT NOT NULL,
  "releaseId"    TEXT,
  "releaseTitle" TEXT NOT NULL,
  "amountMicros" BIGINT NOT NULL,
  "rows"         INTEGER NOT NULL,
  CONSTRAINT "StatementLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StatementLine_importId_releaseId_key" ON "StatementLine"("importId", "releaseId");

CREATE TABLE IF NOT EXISTS "StatementAllocation" (
  "id"           TEXT NOT NULL,
  "importId"     TEXT NOT NULL,
  "lineId"       TEXT NOT NULL,
  "releaseId"    TEXT,
  "releaseTitle" TEXT NOT NULL,
  "partyId"      TEXT,
  "partyKey"     TEXT NOT NULL,
  "partyName"    TEXT NOT NULL,
  "partyRole"    TEXT NOT NULL,
  "shareBps"     INTEGER NOT NULL,
  "sheetVersion" INTEGER NOT NULL,
  "amountMicros" BIGINT NOT NULL,
  CONSTRAINT "StatementAllocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StatementAllocation_importId_lineId_partyKey_key" ON "StatementAllocation"("importId", "lineId", "partyKey");
CREATE INDEX IF NOT EXISTS "StatementAllocation_importId_partyKey_idx" ON "StatementAllocation"("importId", "partyKey");

-- The 30-day sending limit for split-sheet emails: one row per email, no address. Pruned after 30 days.
CREATE TABLE IF NOT EXISTS "SplitSendLog" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SplitSendLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SplitSendLog_organizationId_createdAt_idx" ON "SplitSendLog"("organizationId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "SplitSendLog" ADD CONSTRAINT "SplitSendLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SplitSheet" ADD CONSTRAINT "SplitSheet_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SplitSheet" ADD CONSTRAINT "SplitSheet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SplitParty" ADD CONSTRAINT "SplitParty_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "SplitSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StatementImport" ADD CONSTRAINT "StatementImport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StatementLine" ADD CONSTRAINT "StatementLine_importId_fkey" FOREIGN KEY ("importId") REFERENCES "StatementImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StatementLine" ADD CONSTRAINT "StatementLine_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StatementAllocation" ADD CONSTRAINT "StatementAllocation_importId_fkey" FOREIGN KEY ("importId") REFERENCES "StatementImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StatementAllocation" ADD CONSTRAINT "StatementAllocation_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "SplitParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
