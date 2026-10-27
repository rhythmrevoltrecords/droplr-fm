-- Where an account came from (lib/signup-source). Expand only: the code serving while this runs never
-- reads the table, and a missing row already means "direct or unknown".
CREATE TABLE IF NOT EXISTS "SignupSource" (
    "organizationId" TEXT NOT NULL,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "referrerHost" TEXT,
    "landingPath" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SignupSource_pkey" PRIMARY KEY ("organizationId")
);
-- Each nullable or defaulted column again, in case the table exists in an older shape.
ALTER TABLE "SignupSource" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "SignupSource" ADD COLUMN IF NOT EXISTS "medium" TEXT;
ALTER TABLE "SignupSource" ADD COLUMN IF NOT EXISTS "campaign" TEXT;
ALTER TABLE "SignupSource" ADD COLUMN IF NOT EXISTS "referrerHost" TEXT;
ALTER TABLE "SignupSource" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "SignupSource_source_idx" ON "SignupSource"("source");
DO $$ BEGIN
  ALTER TABLE "SignupSource" ADD CONSTRAINT "SignupSource_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fans' sources, re-read from the referrer each view and click already stored. The old test was a
-- substring match, so /t\.co/ read every reddit.com visit as "x", and a host merely containing
-- "youtube" or "google" took that name. This applies lib/referrer-source.ts's rules to rows whose
-- source came from the referrer alone (no utm_source, no campaign link): the same CASE as that file,
-- checked against it by test:signupsource. Running it again changes nothing.
-- Pre-saves can't be corrected: they never stored the referrer.
CREATE OR REPLACE FUNCTION pg_temp.droplr_ref_source(ref TEXT) RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $f$
  WITH h AS (
    SELECT regexp_replace(regexp_replace(lower(substring(ref FROM '^[Hh][Tt][Tt][Pp][Ss]?://(?:[^/\\@?#]*@)?([^/\\:?#@]+)')), '^www\.', ''), '\.$', '') AS h
  )
  SELECT CASE
    WHEN h IS NULL OR h !~ '^[a-z0-9.-]{1,253}$' OR position('.' IN h) = 0 THEN NULL
    WHEN h ~ '^google\.(com|[a-z]{2})(\.[a-z]{2})?$' THEN 'google'
    WHEN h ~ '(^|\.)instagram\.com$' THEN 'instagram'
    WHEN h ~ '(^|\.)tiktok\.com$' THEN 'tiktok'
    WHEN h ~ '(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$' THEN 'facebook'
    WHEN h ~ '(^|\.)(t\.co|twitter\.com|x\.com)$' THEN 'x'
    WHEN h ~ '(^|\.)(youtube\.com|youtu\.be)$' THEN 'youtube'
    WHEN h ~ '(^|\.)(reddit\.com|redd\.it)$' THEN 'reddit'
    WHEN h ~ '(^|\.)soundcloud\.com$' THEN 'soundcloud'
    WHEN h ~ '(^|\.)(linkedin\.com|lnkd\.in)$' THEN 'linkedin'
    WHEN h ~ '(^|\.)bing\.com$' THEN 'bing'
    WHEN h ~ '(^|\.)duckduckgo\.com$' THEN 'duckduckgo'
    WHEN h ~ '(^|\.)news\.ycombinator\.com$' THEN 'hacker news'
    WHEN h ~ '(^|\.)(chatgpt\.com|chat\.openai\.com)$' THEN 'chatgpt'
    WHEN h ~ '(^|\.)perplexity\.ai$' THEN 'perplexity'
    WHEN h ~ '(^|\.)(discord\.com|discord\.gg|discordapp\.com)$' THEN 'discord'
    ELSE h
  END FROM h
$f$;

UPDATE "PageView" SET "source" = pg_temp.droplr_ref_source("referrer")
WHERE "variantId" IS NULL AND COALESCE("utm_source", '') = '' AND "referrer" IS NOT NULL
  AND "source" IS NOT NULL AND "source" <> 'direct'
  AND pg_temp.droplr_ref_source("referrer") IS NOT NULL
  AND "source" IS DISTINCT FROM pg_temp.droplr_ref_source("referrer");

UPDATE "ClickEvent" SET "source" = pg_temp.droplr_ref_source("referrer")
WHERE "variantId" IS NULL AND COALESCE("utm_source", '') = '' AND "referrer" IS NOT NULL
  AND "source" IS NOT NULL AND "source" <> 'direct'
  AND pg_temp.droplr_ref_source("referrer") IS NOT NULL
  AND "source" IS DISTINCT FROM pg_temp.droplr_ref_source("referrer");
