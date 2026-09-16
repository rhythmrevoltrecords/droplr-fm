-- Proof of agreement / consent. All nullable: rows created before this change have no record.
-- IF NOT EXISTS keeps it safe to re-run.

-- Which Terms/Privacy version a user accepted at signup or invite, and when.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "termsVersion" TEXT;

-- When a fan ticked the release-day email consent box, and which wording they saw (Spam Act proof of consent).
ALTER TABLE "PreSave"
  ADD COLUMN IF NOT EXISTS "consentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "consentVersion" TEXT;
