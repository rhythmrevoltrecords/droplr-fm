-- News emails: a one-off send to fans who ticked the optional "news and new music" box.
-- Idempotent, like every migration here: Netlify runs `prisma migrate deploy` on each build.

CREATE TABLE IF NOT EXISTS "NewsEmail" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "buttonLabel" TEXT,
    "buttonUrl" TEXT,
    "filterCountry" TEXT,
    "filterListenOn" TEXT,
    "filterReleaseId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "processingUntil" TIMESTAMP(3),
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsEmail_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NewsEmailDelivery" (
    "id" TEXT NOT NULL,
    "newsEmailId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "preSaveId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsEmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NewsEmail_organizationId_createdAt_idx" ON "NewsEmail"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "NewsEmail_status_scheduledFor_idx" ON "NewsEmail"("status", "scheduledFor");
CREATE UNIQUE INDEX IF NOT EXISTS "NewsEmailDelivery_newsEmailId_email_key" ON "NewsEmailDelivery"("newsEmailId", "email");
CREATE INDEX IF NOT EXISTS "NewsEmailDelivery_newsEmailId_sentAt_idx" ON "NewsEmailDelivery"("newsEmailId", "sentAt");

DO $$ BEGIN
  ALTER TABLE "NewsEmail" ADD CONSTRAINT "NewsEmail_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "NewsEmailDelivery" ADD CONSTRAINT "NewsEmailDelivery_newsEmailId_fkey"
    FOREIGN KEY ("newsEmailId") REFERENCES "NewsEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
