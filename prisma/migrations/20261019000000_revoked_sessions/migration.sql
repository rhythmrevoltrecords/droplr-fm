-- Logging out revokes that one session, not just the cookie.
--
-- Before this, "Log out" only deleted the cookie: a copied 30-day token (shared computer, a browser
-- extension, a log line) kept working until it expired, a password change, or "sign out everywhere".
-- Bumping User.sessionsValidFrom on logout would sign the person out of every device, which is not
-- what "Log out" means. So each session token now carries a jti, and logging out records it here.
--
-- Rows are only useful until the token would have expired anyway, so expiresAt is stored and old
-- rows are pruned opportunistically. Tokens issued before this change have no jti and can't be
-- revoked individually; they all age out within 30 days.
CREATE TABLE IF NOT EXISTS "RevokedSession" (
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RevokedSession_pkey" PRIMARY KEY ("jti")
);
ALTER TABLE "RevokedSession" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "RevokedSession_expiresAt_idx" ON "RevokedSession"("expiresAt");
