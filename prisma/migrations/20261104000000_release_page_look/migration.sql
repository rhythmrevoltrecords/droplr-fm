-- Release pages get the bio page's look options: theme, font, button colour, background.
--
-- Written by hand and idempotent, because Netlify runs `prisma migrate deploy` on every build.
-- Every column is nullable with no default, so every existing release, pre-save, smart link and
-- download page renders exactly as before until someone on a paid plan changes it.

ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "theme" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "font" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "backgroundUrl" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "backgroundColor" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "buttonColor" TEXT;
