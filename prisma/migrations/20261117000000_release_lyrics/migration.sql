-- A release's lyrics, timed once and read by every clip style.
--
-- "lyrics" is a JSON array of { text, ms } in the order sung: ms is the start of the line in the file
-- the artist timed against, or null for a line not tapped yet. JSONB rather than a table of rows:
-- the lines are only ever read and written as a whole, by one route, and never queried by line.
--
-- "lyricsTrackMs" is the length of that file, and the only thing droplr keeps of it. The file
-- itself never leaves the artist's computer, so the length is how a clip tells that a different
-- file (a radio edit, an extended mix) has been loaded and the lines would land in the wrong place.
--
-- Both nullable, no backfill: a release without lyrics is the common case. Expand only, so the
-- code serving while this runs never reads either column.
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "lyrics" JSONB;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "lyricsTrackMs" INTEGER;
