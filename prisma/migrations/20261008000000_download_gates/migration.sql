-- Download gates: a Release can be a gated free download (edit pack, stems, unreleased, VIP)
-- instead of a store release. Same record so links, QR, variants, insights, fan capture and the
-- press kit all work on both.
--
-- droplr stores the destination URL, never the file. Gates are mostly unofficial remixes, and
-- hosting those would make droplr the party a takedown lands on instead of one that points at it.
--
-- Idempotent: Netlify runs `prisma migrate deploy` on every build.

ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'release';
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "downloadUrl" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "downloadNote" TEXT;

-- BYO SoundCloud app, mirroring the BYO Spotify columns. Self-serve SoundCloud keys require an
-- Artist Pro subscription on the artist's own account; droplr falls back to a platform app.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "soundcloudClientIdEncrypted" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "soundcloudClientSecretEncrypted" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "soundcloudAppStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "soundcloudUserId" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "soundcloudUsername" TEXT;

CREATE TABLE IF NOT EXISTS "GateStep" (
  "id"        TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "position"  INTEGER NOT NULL DEFAULT 0,
  "platform"  TEXT NOT NULL,
  "action"    TEXT NOT NULL,
  "target"    TEXT,
  "targetId"  TEXT,
  "required"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GateStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GateUnlock" (
  "id"        TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "email"     TEXT,
  "anonId"    TEXT NOT NULL,
  "via"       TEXT[],
  "completedAt" TIMESTAMP(3),
  "country"   TEXT,
  "timezone"  TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GateUnlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GateStep_releaseId_position_idx"  ON "GateStep"("releaseId", "position");
ALTER TABLE "GateUnlock" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
-- One progress row per visitor per gate: steps are upserted onto it as they complete.
CREATE UNIQUE INDEX IF NOT EXISTS "GateUnlock_releaseId_anonId_key" ON "GateUnlock"("releaseId", "anonId");
CREATE INDEX IF NOT EXISTS "GateUnlock_releaseId_createdAt_idx" ON "GateUnlock"("releaseId", "createdAt");
CREATE INDEX IF NOT EXISTS "GateUnlock_releaseId_email_idx"     ON "GateUnlock"("releaseId", "email");

-- Gates live and die with their release.
DO $$ BEGIN
  ALTER TABLE "GateStep" ADD CONSTRAINT "GateStep_releaseId_fkey"
    FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GateUnlock" ADD CONSTRAINT "GateUnlock_releaseId_fkey"
    FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Downloads have their own plan cap, so anything counting releases must filter kind='release'.
CREATE INDEX IF NOT EXISTS "Release_organizationId_kind_idx" ON "Release"("organizationId", "kind");
