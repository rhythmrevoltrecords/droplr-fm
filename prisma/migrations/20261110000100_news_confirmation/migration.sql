-- News and bio-page subscriptions now need the fan to click a confirmation email before they
-- count. Ticks taken before this existed keep counting: they were given under wording that said
-- nothing about a confirmation, so they are marked confirmed as of when they were given.
--
-- Keyed on the wording, not a date: every pre-save tick the new code takes carries the v4 wording
-- (2026-10-26.release-day-v4-news-confirmed), so it can never be swept in here. Ticks the old code
-- takes while this deploy builds still carry v3, and the scheduled release check confirms those
-- (lib/news-confirm confirmLegacyNewsTicks). Download-gate rows have their own wording version and
-- no news box on the page, so any news tick on one predates this and is kept. Idempotent.

ALTER TABLE "PreSave" ADD COLUMN IF NOT EXISTS "newsConfirmedAt" TIMESTAMP(3);

UPDATE "PreSave" SET "newsConfirmedAt" = COALESCE("newsConsentAt", "createdAt")
WHERE "newsConsent" = true AND "newsConfirmedAt" IS NULL
  AND "consentVersion" IS DISTINCT FROM '2026-10-26.release-day-v4-news-confirmed';
