-- Connecting a custom domain is invite-only until DOMAINS_OPEN is set.
-- The Netlify alias path has only ever been exercised against a mock, and its failure mode is a
-- customer's domain quietly never going live, so the first real ones are people we can call.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "domainsAllowedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "domainsAllowedBy" TEXT;

-- Anyone already on a domain keeps full control of it, including changing it.
UPDATE "Organization"
   SET "domainsAllowedAt" = COALESCE("customDomainAttachedAt", "customDomainVerifiedAt", now()),
       "domainsAllowedBy" = 'grandfathered'
 WHERE "customDomain" IS NOT NULL AND "domainsAllowedAt" IS NULL;
