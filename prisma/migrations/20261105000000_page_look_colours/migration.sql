-- Text colour, glow colour and social icon style for bio pages and release/pre-save/smart link/
-- download pages.
--
-- Written by hand and idempotent, because Netlify runs `prisma migrate deploy` on every build.
-- All nullable with no default: NULL is the theme's own colour and the current icon row, so every
-- existing page renders exactly as before.

ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "glowColor" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "textColor" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "iconStyle" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "iconColor" TEXT;

ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "glowColor" TEXT;
ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "textColor" TEXT;
ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "iconStyle" TEXT;
ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "iconColor" TEXT;
