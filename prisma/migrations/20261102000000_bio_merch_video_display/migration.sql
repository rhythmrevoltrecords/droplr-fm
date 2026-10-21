-- How the merch and video blocks sit on a bio page.
--
-- Written by hand and idempotent, because Netlify runs `prisma migrate deploy` on every build.
-- All nullable with no default: NULL is the tidy default (merch behind one button, shown as
-- tiles; every video a small tile that opens), so no row has to be touched and a later change of
-- default carries every page that never chose.

-- NULL = a single "Merch" button that opens the items. 'page' = the items sit on the page.
ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "merchShow" TEXT;
-- NULL = tiles, two to a row. 'carousel' = one row you swipe.
ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "merchLayout" TEXT;
-- 'on' = this video is featured: shown full size, ready to play. NULL = a tile that opens it.
ALTER TABLE "BioLink" ADD COLUMN IF NOT EXISTS "highlight" TEXT;
