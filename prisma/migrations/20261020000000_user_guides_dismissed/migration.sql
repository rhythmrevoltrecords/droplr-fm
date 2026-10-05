-- Which "Watch the guide" cards a login has closed.
--
-- A TEXT[] rather than a row per dismissal: there are six guides, the set is read on every admin
-- page render, and a join for six strings that are never queried individually would cost more than
-- it is worth. PromoTaskDone is a table because a tick is per-release and there is no bound on
-- releases; this is per-user and bounded by the config file.
--
-- NOT NULL with a default so every existing login reads as "nothing dismissed" without a backfill,
-- and so application code never has to handle null separately from empty.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "guidesDismissed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
