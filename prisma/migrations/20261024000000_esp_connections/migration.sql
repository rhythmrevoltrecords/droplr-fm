-- ESP (email service provider) connections: push droplr-collected fans into a label's own audience.
--
-- Written by hand and idempotent, because Netlify runs `prisma migrate deploy` on every build.

CREATE TABLE IF NOT EXISTS "EspConnection" (
  "id"              TEXT PRIMARY KEY,
  "organizationId"  TEXT NOT NULL,
  "provider"        TEXT NOT NULL,
  "apiKeyEncrypted" TEXT NOT NULL,
  "listId"          TEXT,
  "listName"        TEXT,
  "marketingOnly"   BOOLEAN NOT NULL DEFAULT true,
  "tagPrefix"       TEXT,
  "status"          TEXT NOT NULL DEFAULT 'active',
  "lastError"       TEXT,
  "lastSyncedAt"    TIMESTAMP(3),
  "lastSyncedCount" INTEGER NOT NULL DEFAULT 0,
  "processingUntil" TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Added separately with IF NOT EXISTS so this file still works against a table created by an
-- older version of itself.
ALTER TABLE "EspConnection" ADD COLUMN IF NOT EXISTS "listId"          TEXT;
ALTER TABLE "EspConnection" ADD COLUMN IF NOT EXISTS "listName"        TEXT;
ALTER TABLE "EspConnection" ADD COLUMN IF NOT EXISTS "marketingOnly"   BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "EspConnection" ADD COLUMN IF NOT EXISTS "tagPrefix"       TEXT;
ALTER TABLE "EspConnection" ADD COLUMN IF NOT EXISTS "status"          TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "EspConnection" ADD COLUMN IF NOT EXISTS "lastError"       TEXT;
ALTER TABLE "EspConnection" ADD COLUMN IF NOT EXISTS "lastSyncedAt"    TIMESTAMP(3);
ALTER TABLE "EspConnection" ADD COLUMN IF NOT EXISTS "lastSyncedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EspConnection" ADD COLUMN IF NOT EXISTS "processingUntil" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "EspConnection_organizationId_provider_key" ON "EspConnection"("organizationId", "provider");
CREATE INDEX IF NOT EXISTS "EspConnection_organizationId_idx" ON "EspConnection"("organizationId");

DO $$ BEGIN
  ALTER TABLE "EspConnection" ADD CONSTRAINT "EspConnection_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
