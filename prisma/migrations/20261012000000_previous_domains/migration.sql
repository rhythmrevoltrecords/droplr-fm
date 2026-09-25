-- A custom domain change used to be a one-way door: the old alias was detached immediately, so every
-- link already shared on it died. Keep the old domains on the org and hold the alias for a year.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "previousDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- The detach queue can now hold a row that isn't due yet.
ALTER TABLE "DomainDetach" ADD COLUMN IF NOT EXISTS "after" TIMESTAMP(3);

-- Host resolution falls back to this lookup whenever a request arrives on a host that isn't a current
-- custom domain, which includes every stray host pointed at the site.
CREATE INDEX IF NOT EXISTS "Organization_previousDomains_idx" ON "Organization" USING GIN ("previousDomains");
