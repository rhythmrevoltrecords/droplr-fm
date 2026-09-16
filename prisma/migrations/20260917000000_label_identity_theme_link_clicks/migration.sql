-- Label identity + appearance, per-link click attribution.
-- Additive only: no ids change, no link rows are touched (ReleaseLink order stays as labels set it).

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "previousSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Australia/Brisbane',
ADD COLUMN "locationLabel" TEXT NOT NULL DEFAULT 'Brisbane',
ADD COLUMN "themePreference" TEXT NOT NULL DEFAULT 'dark',
ADD COLUMN "themePublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "accentColor" TEXT;

-- AlterTable
ALTER TABLE "ClickEvent" ADD COLUMN "linkId" TEXT;

-- CreateIndex
CREATE INDEX "ClickEvent_linkId_idx" ON "ClickEvent"("linkId");

-- Backfill: past smart-link clicks → the release's first link on that platform.
-- Exact for every release that had one link per platform (all releases before this change).
UPDATE "ClickEvent" c
SET "linkId" = l."id"
FROM (
    SELECT DISTINCT ON ("releaseId", "platform") "id", "releaseId", "platform"
    FROM "ReleaseLink"
    ORDER BY "releaseId", "platform", "position"
) l
WHERE c."linkId" IS NULL AND c."releaseId" = l."releaseId" AND c."platform" = l."platform";
