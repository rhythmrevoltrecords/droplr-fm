-- Public glow controls, link button colour, and uploaded link icons.
--
-- Written by hand and idempotent, because Netlify runs `prisma migrate deploy` on every build.
--
-- Organization.publicGlow defaults TRUE and glowColor is NULL, so every existing page keeps the
-- look it has today: the glow on, in the colour extracted from the artwork. The two nullable
-- columns on the link tables and BioPage.buttonColor are all "no opinion" by default for the
-- same reason.

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "publicGlow" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "glowColor" TEXT;

ALTER TABLE "BioPage" ADD COLUMN IF NOT EXISTS "buttonColor" TEXT;

ALTER TABLE "BioLink" ADD COLUMN IF NOT EXISTS "iconUrl" TEXT;
ALTER TABLE "ReleaseLink" ADD COLUMN IF NOT EXISTS "iconUrl" TEXT;
