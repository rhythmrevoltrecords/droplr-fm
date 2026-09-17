-- Feedback conversations with the droplr.fm team, and refer-a-friend rewards. Additive.

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_referralCode_key" ON "Organization"("referralCode");

CREATE TABLE IF NOT EXISTS "FeedbackThread" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'idea',
    "subject" TEXT NOT NULL,
    "page" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "unreadByUser" BOOLEAN NOT NULL DEFAULT false,
    "unreadByTeam" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackThread_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FeedbackThread_userId_lastMessageAt_idx" ON "FeedbackThread"("userId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "FeedbackThread_unreadByTeam_lastMessageAt_idx" ON "FeedbackThread"("unreadByTeam", "lastMessageAt");
DO $$ BEGIN
  ALTER TABLE "FeedbackThread" ADD CONSTRAINT "FeedbackThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "FeedbackThread" ADD CONSTRAINT "FeedbackThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "FeedbackMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "fromTeam" BOOLEAN NOT NULL DEFAULT false,
    "authorEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FeedbackMessage_threadId_createdAt_idx" ON "FeedbackMessage"("threadId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "FeedbackMessage" ADD CONSTRAINT "FeedbackMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "FeedbackThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Referral" (
    "id" TEXT NOT NULL,
    "referrerOrgId" TEXT NOT NULL,
    "referredOrgId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "earnedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "stripeCouponId" TEXT,
    "note" TEXT,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_referredOrgId_key" ON "Referral"("referredOrgId");
CREATE INDEX IF NOT EXISTS "Referral_referrerOrgId_status_idx" ON "Referral"("referrerOrgId", "status");
CREATE INDEX IF NOT EXISTS "Referral_status_checkedAt_idx" ON "Referral"("status", "checkedAt");
DO $$ BEGIN
  ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerOrgId_fkey" FOREIGN KEY ("referrerOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredOrgId_fkey" FOREIGN KEY ("referredOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
