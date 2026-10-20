-- Bio page backgrounds, and the label badge on a linked artist's own page.
--
-- Written by hand and idempotent, because Netlify runs `prisma migrate deploy` on every build.
--
-- BioPage.labelBadge is nullable with no default, so no existing page starts displaying anyone
-- else's name and logo on deploy. Artist.labelBadge defaults TRUE because that is the label's
-- half of the permission and signing an artist is public anyway; the artist still has to turn it
-- on for it to appear anywhere.

ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "backgroundUrl" TEXT;
ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "backgroundColor" TEXT;
ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "labelBadge" TEXT;

ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "labelBadge" BOOLEAN NOT NULL DEFAULT true;
