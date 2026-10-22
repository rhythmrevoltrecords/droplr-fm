-- Background blur for bio pages and release/pre-save/smart link/download pages.
--
-- Written by hand and idempotent, because Netlify runs `prisma migrate deploy` on every build.
-- The blur is baked into a stored copy of the image when the page is saved; backgroundUrl keeps
-- pointing at whatever is shown, and backgroundSourceUrl keeps the original so the amount can be
-- changed later without blurring a blur. Both nullable: no existing page changes.

ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "backgroundSourceUrl" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "backgroundBlur" TEXT;

ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "backgroundSourceUrl" TEXT;
ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "backgroundBlur" TEXT;
