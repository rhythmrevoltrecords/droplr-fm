-- One line of lyric on a release, for the lyric share graphic.
--
-- Nullable with no backfill, so ADD COLUMN IF NOT EXISTS is the whole migration: a release without
-- a line simply doesn't offer that graphic, which is the common case and the behaviour the suite
-- asserts.
--
-- TEXT rather than VARCHAR(n): the length limit belongs in the zod schema, where it can change
-- without a migration, and where the error reaches the artist as a sentence instead of a 500.
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "lyricLine" TEXT;
