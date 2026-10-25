-- Report and contest-withdraw links were stored as plaintext tokens, so anyone holding a copy of
-- the database could open every shared report and withdraw every contest entry. Store the sha256
-- for lookup instead. Links already sent keep working: the hash is computed from the old token.
--
-- Expand only. Netlify runs `prisma migrate deploy` before the new code is built, so the old code
-- keeps serving against this schema for the length of the build (and indefinitely if the build
-- fails). Nothing here may break it: no column is dropped and nothing becomes NOT NULL. The
-- plaintext columns are emptied by the scheduled release check once the new code is live
-- (lib/report sealLegacyReportTokens, lib/contest-server hashLegacyWithdrawTokens), and dropped in
-- a later release. Idempotent: every statement is safe to run twice.

ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "reportTokenHash" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "reportTokenEncrypted" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Release_reportTokenHash_key" ON "Release"("reportTokenHash");
UPDATE "Release" SET "reportTokenHash" = encode(sha256(convert_to("reportToken", 'UTF8')), 'hex')
WHERE "reportToken" IS NOT NULL AND "reportTokenHash" IS NULL;

ALTER TABLE "ContestEntry" ADD COLUMN IF NOT EXISTS "withdrawTokenHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ContestEntry_withdrawTokenHash_key" ON "ContestEntry"("withdrawTokenHash");
UPDATE "ContestEntry" SET "withdrawTokenHash" = encode(sha256(convert_to("withdrawToken", 'UTF8')), 'hex')
WHERE "withdrawToken" IS NOT NULL AND "withdrawTokenHash" IS NULL;
-- The new code writes only the hash, so the plaintext column must accept NULL.
ALTER TABLE "ContestEntry" ALTER COLUMN "withdrawToken" DROP NOT NULL;
