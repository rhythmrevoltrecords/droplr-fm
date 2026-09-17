-- Platform-owner signup invites (email or open links) onto the Free plan. Additive.
CREATE TABLE IF NOT EXISTS "SignupInvite" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenEncrypted" TEXT NOT NULL,
    "email" TEXT,
    "kind" TEXT,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "emailedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SignupInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SignupInvite_tokenHash_key" ON "SignupInvite"("tokenHash");
CREATE INDEX IF NOT EXISTS "SignupInvite_email_idx" ON "SignupInvite"("email");
CREATE INDEX IF NOT EXISTS "SignupInvite_createdAt_idx" ON "SignupInvite"("createdAt");

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "signupInviteId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Organization" ADD CONSTRAINT "Organization_signupInviteId_fkey" FOREIGN KEY ("signupInviteId") REFERENCES "SignupInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
