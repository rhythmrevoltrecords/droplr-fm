-- When a fan unsubscribed or turned emails back on, per account. Append-only.
-- The data processing terms say droplr records both; until now only the current state was kept.
-- Idempotent: Netlify runs `prisma migrate deploy` on every build.

CREATE TABLE IF NOT EXISTS "ConsentEvent" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email"          TEXT NOT NULL,
  "kind"           TEXT NOT NULL,
  "via"            TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConsentEvent_organizationId_email_idx" ON "ConsentEvent"("organizationId", "email");

DO $$ BEGIN
  ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A Mailchimp unsubscribe used to set status 'unsubscribed' on Spotify and Deezer pre-save rows too,
-- which silently cancelled the fan's library save. Only email rows carry that status; put those
-- rows back to where their save stands, with email consent off (they did opt out of email). A row
-- that turns out to be completed drops its token here: the earlier migration only saw 'unsubscribed'.
UPDATE "PreSave"
SET "status" = CASE WHEN "completedAt" IS NOT NULL THEN 'completed' ELSE 'pending' END,
    "refreshTokenEncrypted" = CASE WHEN "completedAt" IS NOT NULL THEN NULL ELSE "refreshTokenEncrypted" END,
    "emailConsent" = false,
    "newsConsent" = false
WHERE "platform" IN ('spotify', 'deezer') AND "status" = 'unsubscribed';
