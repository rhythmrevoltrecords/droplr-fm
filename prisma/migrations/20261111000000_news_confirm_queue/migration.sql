-- Confirmation emails owed or sent, one row per address per account (lib/news-confirm). A request
-- turned away by the account's daily ceiling is kept here and sent later by the release check,
-- instead of being dropped. Additive only; idempotent.

CREATE TABLE IF NOT EXISTS "NewsConfirmRequest" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email"          TEXT NOT NULL,
  "requestedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt"         TIMESTAMP(3),
  CONSTRAINT "NewsConfirmRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NewsConfirmRequest_organizationId_email_key" ON "NewsConfirmRequest"("organizationId", "email");
CREATE INDEX IF NOT EXISTS "NewsConfirmRequest_sentAt_requestedAt_idx" ON "NewsConfirmRequest"("sentAt", "requestedAt");

DO $$ BEGIN
  ALTER TABLE "NewsConfirmRequest" ADD CONSTRAINT "NewsConfirmRequest_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
