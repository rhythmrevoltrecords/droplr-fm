-- Remix contests: one per release, entries stored as links.
--
-- There is no file or blob column here and adding one is not a small change. Australia has no
-- copyright safe harbour for commercial content hosts — the 2018 amendments covered carriage
-- service providers, libraries, archives, educational institutions and disability organisations and
-- left hosts out on purpose. Holding entrants' audio would move droplr from pointing at a file to
-- being the party a notice lands on, with no §512(c)-equivalent to stand behind.
--
-- Idempotent: Netlify runs `prisma migrate deploy` on every build.

CREATE TABLE IF NOT EXISTS "Contest" (
  "id"                TEXT NOT NULL,
  "organizationId"    TEXT NOT NULL,
  "releaseId"         TEXT NOT NULL,
  "headline"          TEXT NOT NULL,
  "brief"             TEXT,
  "prize"             TEXT,
  "published"         BOOLEAN NOT NULL DEFAULT false,
  "opensAt"           TIMESTAMP(3),
  "closesAt"          TIMESTAMP(3) NOT NULL,
  "winnerAnnouncedAt" TIMESTAMP(3),
  "maxPerEntrant"     INTEGER NOT NULL DEFAULT 1,
  "rulesUrl"          TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Contest_pkey" PRIMARY KEY ("id")
);

-- One contest per release: the release IS the contest's identity on the public page, so a second
-- one would make "which contest does this page show?" ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS "Contest_releaseId_key" ON "Contest"("releaseId");
CREATE INDEX IF NOT EXISTS "Contest_organizationId_idx" ON "Contest"("organizationId");
CREATE INDEX IF NOT EXISTS "Contest_closesAt_idx" ON "Contest"("closesAt");

CREATE TABLE IF NOT EXISTS "ContestEntry" (
  "id"                 TEXT NOT NULL,
  "organizationId"     TEXT NOT NULL,
  "contestId"          TEXT NOT NULL,
  "email"              TEXT NOT NULL,
  "artistName"         TEXT NOT NULL,
  "link"               TEXT NOT NULL,
  "linkNormalised"     TEXT NOT NULL,
  "linkHost"           TEXT,
  "note"               TEXT,
  "declarationVersion" INTEGER NOT NULL,
  "declarationText"    TEXT NOT NULL,
  "declarationAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipHash"             TEXT,
  "country"            TEXT,
  "linkCheck"          TEXT NOT NULL DEFAULT 'unchecked',
  "linkCheckedAt"      TIMESTAMP(3),
  "status"             TEXT NOT NULL DEFAULT 'new',
  "labelNote"          TEXT,
  "withdrawnAt"        TIMESTAMP(3),
  "withdrawToken"      TEXT NOT NULL,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContestEntry_pkey" PRIMARY KEY ("id")
);

-- The deduplication guarantee, enforced by the database rather than by the submit route: two rows
-- can never share a link within one contest, so "has anyone else already entered this?" always has
-- exactly one answer. A withdrawn entry keeps its row, which is what keeps that true.
CREATE UNIQUE INDEX IF NOT EXISTS "ContestEntry_contestId_linkNormalised_key" ON "ContestEntry"("contestId", "linkNormalised");
CREATE UNIQUE INDEX IF NOT EXISTS "ContestEntry_withdrawToken_key" ON "ContestEntry"("withdrawToken");
CREATE INDEX IF NOT EXISTS "ContestEntry_contestId_status_idx" ON "ContestEntry"("contestId", "status");
CREATE INDEX IF NOT EXISTS "ContestEntry_contestId_createdAt_idx" ON "ContestEntry"("contestId", "createdAt");
CREATE INDEX IF NOT EXISTS "ContestEntry_organizationId_idx" ON "ContestEntry"("organizationId");
CREATE INDEX IF NOT EXISTS "ContestEntry_contestId_email_idx" ON "ContestEntry"("contestId", "email");

-- Belt and braces, the way 20261008000000_download_gates does it: CREATE TABLE IF NOT EXISTS is a
-- no-op against a table that already exists in an OLDER shape, so `migrate deploy` would pass and the
-- app would fail at runtime on a missing column. Naming every nullable/defaulted column again costs
-- nothing and makes that impossible.
ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "brief" TEXT;
ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "prize" TEXT;
ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "published" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "opensAt" TIMESTAMP(3);
ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "winnerAnnouncedAt" TIMESTAMP(3);
ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "maxPerEntrant" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "rulesUrl" TEXT;

ALTER TABLE "ContestEntry" ADD COLUMN IF NOT EXISTS "linkHost" TEXT;
ALTER TABLE "ContestEntry" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "ContestEntry" ADD COLUMN IF NOT EXISTS "ipHash" TEXT;
ALTER TABLE "ContestEntry" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "ContestEntry" ADD COLUMN IF NOT EXISTS "linkCheck" TEXT NOT NULL DEFAULT 'unchecked';
ALTER TABLE "ContestEntry" ADD COLUMN IF NOT EXISTS "linkCheckedAt" TIMESTAMP(3);
ALTER TABLE "ContestEntry" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'new';
ALTER TABLE "ContestEntry" ADD COLUMN IF NOT EXISTS "labelNote" TEXT;
ALTER TABLE "ContestEntry" ADD COLUMN IF NOT EXISTS "withdrawnAt" TIMESTAMP(3);
ALTER TABLE "ContestEntry" ADD COLUMN IF NOT EXISTS "declarationAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN
  ALTER TABLE "Contest" ADD CONSTRAINT "Contest_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Contest" ADD CONSTRAINT "Contest_releaseId_fkey"
    FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContestEntry" ADD CONSTRAINT "ContestEntry_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContestEntry" ADD CONSTRAINT "ContestEntry_contestId_fkey"
    FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
