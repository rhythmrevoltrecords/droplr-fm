-- The order of the blocks on a bio page.
--
-- Written by hand and idempotent, because Netlify runs `prisma migrate deploy` on every build.
--
-- NULL means "the default order", which is what every existing page gets and what every page
-- that never touches the control keeps. Storing the default explicitly would mean a page could
-- be pinned to today's section list and silently miss a block added later -- lib/bio-sections
-- reconciles against the code's own list for exactly that reason, and NULL is the tidiest way
-- to say "no opinion".
--
-- A plain comma-separated string rather than JSON or a join table: it is a short list of keys
-- from a fixed set, never queried on, and never read without being reconciled first.

ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "sectionOrder" TEXT;
