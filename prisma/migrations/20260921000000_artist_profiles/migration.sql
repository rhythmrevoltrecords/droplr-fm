-- Artist roster profiles: artists exist on the roster with or without a login.
-- Additive and nullable only; IF NOT EXISTS / NOT EXISTS guards keep it safe to re-run.
-- Release."artistId" stays as the login-access column, now derived from the profile's "userId".

CREATE TABLE IF NOT EXISTS "Artist" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "genre" TEXT,
    "bio" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "website" TEXT,
    "socialLinks" JSONB,
    "photoUrl" TEXT,
    "pressPhotoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accentColor" TEXT,
    "signedAt" TIMESTAMP(3),
    "notes" TEXT,
    "spotifyArtistId" TEXT,
    "monthlyListeners" INTEGER,
    "followers" INTEGER,
    "statsUpdatedAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Artist_userId_key" ON "Artist"("userId");
CREATE INDEX IF NOT EXISTS "Artist_organizationId_idx" ON "Artist"("organizationId");
DO $$ BEGIN
  ALTER TABLE "Artist" ADD CONSTRAINT "Artist_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Artist" ADD CONSTRAINT "Artist_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "artistProfileId" TEXT;
CREATE INDEX IF NOT EXISTS "Release_artistProfileId_idx" ON "Release"("artistProfileId");
DO $$ BEGIN
  ALTER TABLE "Release" ADD CONSTRAINT "Release_artistProfileId_fkey"
    FOREIGN KEY ("artistProfileId") REFERENCES "Artist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Invite" ADD COLUMN IF NOT EXISTS "artistProfileId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Invite" ADD CONSTRAINT "Invite_artistProfileId_fkey"
    FOREIGN KEY ("artistProfileId") REFERENCES "Artist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill: every existing artist login gets a profile (md5 text id: pgcrypto isn't guaranteed).
INSERT INTO "Artist" ("id", "organizationId", "name", "email", "userId", "createdAt", "updatedAt")
SELECT 'art_' || md5(random()::text || clock_timestamp()::text || u."id"),
       u."organizationId",
       COALESCE(NULLIF(btrim(u."artistName"), ''), split_part(u."email", '@', 1)),
       u."email",
       u."id",
       u."createdAt",
       CURRENT_TIMESTAMP
FROM "User" u
WHERE u."role" = 'artist'
  AND NOT EXISTS (SELECT 1 FROM "Artist" a WHERE a."userId" = u."id");

-- Existing release assignments → the matching profile (same org). Only fills blanks, so re-runs are no-ops.
UPDATE "Release" r
SET "artistProfileId" = a."id"
FROM "Artist" a
WHERE r."artistProfileId" IS NULL
  AND r."artistId" IS NOT NULL
  AND a."userId" = r."artistId"
  AND a."organizationId" = r."organizationId";
