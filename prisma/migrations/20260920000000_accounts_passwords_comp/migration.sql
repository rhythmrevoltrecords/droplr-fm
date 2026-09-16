-- Password reset, session revocation, login/reset rate limiting, complimentary plans.
-- Additive and nullable only; IF NOT EXISTS keeps it safe to re-run.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionsValidFrom" TIMESTAMP(3);

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "compPlan" TEXT,
  ADD COLUMN IF NOT EXISTS "compNote" TEXT,
  ADD COLUMN IF NOT EXISTS "compSetAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "compSetBy" TEXT;

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
DO $$ BEGIN
  ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AuthThrottle" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuthThrottle_key_createdAt_idx" ON "AuthThrottle"("key", "createdAt");
