-- Merch and video blocks on a bio page, and the opt-in public gallery of live pages.
--
-- Written by hand and idempotent, because Netlify runs `prisma migrate deploy` on every build.
-- Every column is nullable with no default, so this is a no-op for every row that exists today:
-- no existing link moves, no existing page shows anything new, and no page is listed anywhere.

-- Which block of the page a BioLink belongs to. NULL = the ordinary link buttons, which is every
-- row that exists. 'merch' and 'video' rows are still BioLinks so a tap on one goes through the
-- same counted redirect (/api/b/<id>) and shows up in the same "what they tapped" stats.
ALTER TABLE "BioLink" ADD COLUMN IF NOT EXISTS "section" TEXT;

-- 'on' = the owner ticked "show this page in droplr's gallery". NULL = not listed. Opt-in only:
-- putting someone's page on droplr's own marketing page is their decision, never a default.
ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "gallery" TEXT;
-- When it was ticked, so the gallery can list newest-first without guessing from createdAt.
ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "galleryAt" TIMESTAMP(3);
