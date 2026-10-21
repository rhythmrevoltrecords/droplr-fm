-- A row of social icons under the name on a bio page and on a release page (pre-save and smart
-- link), read from the artist's profile.
--
-- Written by hand and idempotent, because Netlify runs `prisma migrate deploy` on every build.
-- 'on' = show them. NULL = don't. Opt-in like every other block that publishes something: pages
-- that already exist stay exactly as they are until their owner ticks it. New pages and new
-- releases are created with it on, because the form shows which icons will appear.
ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "socialIcons" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "socialIcons" TEXT;
