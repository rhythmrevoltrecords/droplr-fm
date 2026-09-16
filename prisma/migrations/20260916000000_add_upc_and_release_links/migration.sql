-- Odesli is gone (public API discontinued 2026-07-31). Links now resolve from UPC/ISRC
-- (iTunes lookup + Deezer public API), and every button lives in ReleaseLink.

-- AlterTable
ALTER TABLE "Release" ADD COLUMN "upc" TEXT,
ADD COLUMN "isrc" TEXT;

-- AlterTable
ALTER TABLE "BioLink" ADD COLUMN "buttonText" TEXT,
ADD COLUMN "icon" TEXT;

-- CreateTable
CREATE TABLE "ReleaseLink" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "buttonText" TEXT,
    "icon" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReleaseLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReleaseLink_releaseId_position_idx" ON "ReleaseLink"("releaseId", "position");

-- AddForeignKey
ALTER TABLE "ReleaseLink" ADD CONSTRAINT "ReleaseLink_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy existing links. Labels' own drag order is preserved (re-numbered 0..n per release);
-- hidden state carries over from isActive; ids are kept so /api/r?l={id} custom links keep working.
INSERT INTO "ReleaseLink" ("id", "releaseId", "platform", "url", "title", "visible", "position", "isCustom")
SELECT
    "id",
    "releaseId",
    "platform",
    "url",
    "label",
    "isActive",
    (ROW_NUMBER() OVER (PARTITION BY "releaseId" ORDER BY "order", "id") - 1)::INTEGER,
    "isCustom"
FROM "PlatformLink";

-- DropTable (data copied above)
DROP TABLE "PlatformLink";
