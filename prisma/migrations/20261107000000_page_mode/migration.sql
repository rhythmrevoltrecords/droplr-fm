-- Light, dark or system mode per release/download page, replacing the account-wide
-- "Apply theme to public smart links" switch in Settings.
--
-- Written by hand and idempotent, because Netlify runs `prisma migrate deploy` on every build.
--
-- Carries the old switch over so no page changes on deploy:
--  - releases and downloads of an account that had the switch on take its light or system mode,
--    but only where pageMode is still NULL, so a second run changes nothing;
--  - bio pages already pick their own look, so a bio page on the default look of an account that
--    showed light pages becomes Paper (the bio page's light look). There is no "system" bio look, so
--    those stay on the default.
-- Organization.themePublic is left in place, unused, rather than dropped: dropping a column is the
-- one step that can't be undone by deploying the previous build.

ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "pageMode" TEXT;

UPDATE "Release" r
SET "pageMode" = o."themePreference"
FROM "Organization" o
WHERE r."organizationId" = o."id"
  AND o."themePublic" = true
  AND o."themePreference" IN ('light', 'system')
  AND r."pageMode" IS NULL;

UPDATE "BioPage" b
SET "theme" = 'paper'
FROM "Organization" o
WHERE b."organizationId" = o."id"
  AND o."themePublic" = true
  AND o."themePreference" = 'light'
  AND b."theme" IS NULL;
