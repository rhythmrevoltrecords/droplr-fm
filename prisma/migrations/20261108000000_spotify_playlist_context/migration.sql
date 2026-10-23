-- Optional playlist the Spotify button opens the track inside (lib/spotify-context). NULL = off.
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "spotifyPlaylist" TEXT;
