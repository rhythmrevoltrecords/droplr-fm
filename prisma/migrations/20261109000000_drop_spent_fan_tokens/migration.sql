-- Fans' Spotify and Deezer tokens were kept after the save they were granted for had already
-- happened (or permanently failed). A token is only needed while the save is still to come.
-- Idempotent: once cleared, a second run matches nothing.
UPDATE "PreSave"
SET "refreshTokenEncrypted" = NULL
WHERE "status" IN ('completed', 'failed')
  AND "refreshTokenEncrypted" IS NOT NULL;
