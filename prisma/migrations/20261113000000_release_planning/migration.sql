-- Release planning for teams: who a promo step belongs to, the label's own tasks on a release,
-- and a per-login switch for the reminder email. Additive only; idempotent.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "taskEmails" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "PromoStepAssign" (
  "id"        TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "key"       TEXT NOT NULL,
  "assignee"  TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromoStepAssign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PromoStepAssign_releaseId_key_key" ON "PromoStepAssign"("releaseId", "key");
DO $$ BEGIN
  ALTER TABLE "PromoStepAssign" ADD CONSTRAINT "PromoStepAssign_releaseId_fkey"
    FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ReleaseTask" (
  "id"             TEXT NOT NULL,
  "releaseId"      TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "note"           TEXT,
  "day"            INTEGER NOT NULL,
  "assignee"       TEXT NOT NULL DEFAULT 'label',
  "doneAt"         TIMESTAMP(3),
  "doneById"       TEXT,
  "remindedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReleaseTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ReleaseTask_releaseId_idx" ON "ReleaseTask"("releaseId");
CREATE INDEX IF NOT EXISTS "ReleaseTask_organizationId_idx" ON "ReleaseTask"("organizationId");
DO $$ BEGIN
  ALTER TABLE "ReleaseTask" ADD CONSTRAINT "ReleaseTask_releaseId_fkey"
    FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ReleaseTask" ADD CONSTRAINT "ReleaseTask_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ReleaseTask" ADD CONSTRAINT "ReleaseTask_doneById_fkey"
    FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
