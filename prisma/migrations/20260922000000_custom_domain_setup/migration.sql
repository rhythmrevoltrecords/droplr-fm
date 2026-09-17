-- Self-serve custom domains: prove ownership with a TXT record, then droplr attaches the domain to Netlify itself.
-- Additive and nullable only; IF NOT EXISTS guards keep it safe to re-run.

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "customDomainToken" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "customDomainVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "customDomainAttachedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "customDomainLiveAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "customDomainCheckedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "customDomainError" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "customDomainFailures" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "DomainDetach" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DomainDetach_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DomainDetach_domain_key" ON "DomainDetach"("domain");

-- Domains connected by hand before this existed (already attached in Netlify and serving): treat as verified and live.
UPDATE "Organization"
SET "customDomainToken" = COALESCE("customDomainToken", substr(md5(random()::text || "id"), 1, 24)),
    "customDomainVerifiedAt" = COALESCE("customDomainVerifiedAt", CURRENT_TIMESTAMP),
    "customDomainAttachedAt" = COALESCE("customDomainAttachedAt", CURRENT_TIMESTAMP),
    "customDomainLiveAt" = COALESCE("customDomainLiveAt", CURRENT_TIMESTAMP)
WHERE "customDomain" IS NOT NULL AND "customDomain" <> 'droplr.fm' AND "customDomainToken" IS NULL;
