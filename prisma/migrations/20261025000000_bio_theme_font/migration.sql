-- Bio page look: one of four themes and one of four fonts, chosen in the admin.
--
-- Written by hand and idempotent, because Netlify runs `prisma migrate deploy` on every build.
-- Both nullable with no default: NULL means "whatever the current default look is", so an
-- existing page keeps rendering exactly as it does today and a later change of default
-- carries existing pages with it instead of freezing them.

ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "theme" TEXT;
ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "font" TEXT;
