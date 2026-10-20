-- A bio page writes to the same analytics tables a release page does.
--
-- Written by hand and idempotent, because Netlify runs `prisma migrate deploy` on every build.
--
-- Until now PageView.releaseId and ClickEvent.releaseId were NOT NULL, so a bio page could not
-- write a row at all: it got BioPage.views and BioLink.clicks, two integers, while every release
-- page got source, utm, referrer, country, timezone, device and an anonymous visitor id.
--
-- Both columns become nullable and gain a bioPageId beside them. One definition of "a view", one
-- place the country and device resolution lives, and a bio page's numbers sit in the same tables
-- as everything else.
--
-- THE CHECK CONSTRAINT IS THE POINT. Two nullable foreign keys where exactly one must be set is
-- an invitation to write a row that belongs to nothing, or to both. The database refuses instead
-- of trusting every call site to remember. Existing rows all have releaseId and no bioPageId, so
-- they satisfy it and the ALTER validates without a rewrite.
--
-- ON DELETE CASCADE matches releaseId: deleting a bio page takes its own analytics with it, the
-- same way deleting a release does. That is different from FanContact.bioPageId, which is SET
-- NULL on purpose -- a fan's address is the account's and outlives the page, while a view of a
-- page that no longer exists is not a fact about anything.

ALTER TABLE "PageView"   ALTER COLUMN "releaseId" DROP NOT NULL;
ALTER TABLE "ClickEvent" ALTER COLUMN "releaseId" DROP NOT NULL;

ALTER TABLE "PageView"   ADD COLUMN IF NOT EXISTS "bioPageId" TEXT;
ALTER TABLE "ClickEvent" ADD COLUMN IF NOT EXISTS "bioPageId" TEXT;
-- Which button on a bio page. ClickEvent.linkId already holds a ReleaseLink id; which table it
-- points at is decided by whether releaseId or bioPageId is set, so it does not need a twin.
ALTER TABLE "ClickEvent" ADD COLUMN IF NOT EXISTS "bioLinkId" TEXT;

CREATE INDEX IF NOT EXISTS "PageView_bioPageId_createdAt_idx"   ON "PageView"("bioPageId", "createdAt");
CREATE INDEX IF NOT EXISTS "ClickEvent_bioPageId_createdAt_idx" ON "ClickEvent"("bioPageId", "createdAt");
CREATE INDEX IF NOT EXISTS "ClickEvent_bioLinkId_idx"           ON "ClickEvent"("bioLinkId");

DO $$
BEGIN
  ALTER TABLE "PageView"
    ADD CONSTRAINT "PageView_bioPageId_fkey"
    FOREIGN KEY ("bioPageId") REFERENCES "BioPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ClickEvent"
    ADD CONSTRAINT "ClickEvent_bioPageId_fkey"
    FOREIGN KEY ("bioPageId") REFERENCES "BioPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ClickEvent"
    ADD CONSTRAINT "ClickEvent_bioLinkId_fkey"
    FOREIGN KEY ("bioLinkId") REFERENCES "BioLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Exactly one subject. Not "at least one": a row with both would be counted twice, once under a
-- release and once under a page, and nothing downstream would notice.
DO $$
BEGIN
  ALTER TABLE "PageView"
    ADD CONSTRAINT "PageView_one_subject"
    CHECK (("releaseId" IS NOT NULL) <> ("bioPageId" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ClickEvent"
    ADD CONSTRAINT "ClickEvent_one_subject"
    CHECK (("releaseId" IS NOT NULL) <> ("bioPageId" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A bio link id only ever belongs to a bio page's row.
DO $$
BEGIN
  ALTER TABLE "ClickEvent"
    ADD CONSTRAINT "ClickEvent_bioLink_needs_bioPage"
    CHECK ("bioLinkId" IS NULL OR "bioPageId" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
