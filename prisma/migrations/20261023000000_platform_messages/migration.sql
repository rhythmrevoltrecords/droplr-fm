-- Dashboard notices from droplr.fm: to one account, or to everyone.
--
-- Written by hand and idempotent, because Netlify runs `prisma migrate deploy` on every build.

CREATE TABLE IF NOT EXISTS "PlatformMessage" (
  "id"             TEXT PRIMARY KEY,
  "title"          TEXT,
  "body"           TEXT NOT NULL,
  "linkUrl"        TEXT,
  "linkLabel"      TEXT,
  "tone"           TEXT NOT NULL DEFAULT 'info',
  "organizationId" TEXT,
  "startsAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt"         TIMESTAMP(3),
  "revokedAt"      TIMESTAMP(3),
  "createdBy"      TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Added separately with IF NOT EXISTS so this file still works against a table created by an
-- older version of itself.
ALTER TABLE "PlatformMessage" ADD COLUMN IF NOT EXISTS "linkUrl"   TEXT;
ALTER TABLE "PlatformMessage" ADD COLUMN IF NOT EXISTS "linkLabel" TEXT;
ALTER TABLE "PlatformMessage" ADD COLUMN IF NOT EXISTS "tone"      TEXT NOT NULL DEFAULT 'info';
ALTER TABLE "PlatformMessage" ADD COLUMN IF NOT EXISTS "endsAt"    TIMESTAMP(3);
ALTER TABLE "PlatformMessage" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "PlatformMessage_organizationId_idx" ON "PlatformMessage"("organizationId");
CREATE INDEX IF NOT EXISTS "PlatformMessage_createdAt_idx"      ON "PlatformMessage"("createdAt");

CREATE TABLE IF NOT EXISTS "PlatformMessageSeen" (
  "messageId" TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "seenAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformMessageSeen_pkey" PRIMARY KEY ("messageId", "userId")
);

CREATE INDEX IF NOT EXISTS "PlatformMessageSeen_userId_idx" ON "PlatformMessageSeen"("userId");

DO $$ BEGIN
  ALTER TABLE "PlatformMessage" ADD CONSTRAINT "PlatformMessage_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PlatformMessageSeen" ADD CONSTRAINT "PlatformMessageSeen_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "PlatformMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PlatformMessageSeen" ADD CONSTRAINT "PlatformMessageSeen_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
