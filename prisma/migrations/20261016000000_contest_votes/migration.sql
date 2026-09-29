-- Public votes on contest entries, and the plan flag that gates creating a contest.
--
-- One vote per visitor per contest, movable: the unique index on (contestId, anonId) is the rule, not
-- a convention the route has to remember. A heart per entry would reward whoever gets the most people
-- to tap the most buttons; one movable pick makes the counts add up to the number of people who voted.
--
-- Votes are advisory. Nothing here picks a winner — ContestEntry.status does, and a label sets it.
--
-- Idempotent: Netlify runs `prisma migrate deploy` on every build.

CREATE TABLE IF NOT EXISTS "ContestVote" (
  "id"        TEXT NOT NULL,
  "contestId" TEXT NOT NULL,
  "entryId"   TEXT NOT NULL,
  "anonId"    TEXT NOT NULL,
  "ipHash"    TEXT,
  "country"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContestVote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ContestVote" ADD COLUMN IF NOT EXISTS "ipHash"  TEXT;
ALTER TABLE "ContestVote" ADD COLUMN IF NOT EXISTS "country" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ContestVote_contestId_anonId_key" ON "ContestVote"("contestId", "anonId");
CREATE INDEX IF NOT EXISTS "ContestVote_entryId_idx" ON "ContestVote"("entryId");

DO $$ BEGIN
  ALTER TABLE "ContestVote" ADD CONSTRAINT "ContestVote_contestId_fkey"
    FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContestVote" ADD CONSTRAINT "ContestVote_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "ContestEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
