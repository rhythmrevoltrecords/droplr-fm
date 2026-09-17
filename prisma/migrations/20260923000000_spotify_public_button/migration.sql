-- Spotify pre-save button visibility. A BYO Spotify app in Development Mode only works for 5 allowlisted users,
-- so the public button is off unless the label switches it on (or shares a ?spotify=1 VIP link).
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "spotifyPublicButton" BOOLEAN NOT NULL DEFAULT false;
