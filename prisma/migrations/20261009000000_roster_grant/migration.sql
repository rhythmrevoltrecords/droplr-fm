-- Roster grants: an artist who already has their own droplr account can be linked to a label's
-- roster row, so the label's releases under their name show on their own dashboard.
--
-- A grant is read-only and one-way. Every existing query is already scoped by organizationId
-- (audited 22 Sep), so a cross-org link changes nothing except the one dashboard query that
-- opts into it.
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "linkedUserId" TEXT;
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "linkedAt" TIMESTAMP(3);
ALTER TABLE "Invite" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'signup';

CREATE INDEX IF NOT EXISTS "Artist_linkedUserId_idx" ON "Artist"("linkedUserId");

DO $$ BEGIN
  ALTER TABLE "Artist" ADD CONSTRAINT "Artist_linkedUserId_fkey"
    FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
