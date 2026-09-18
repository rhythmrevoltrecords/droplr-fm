-- Intent flags captured before the features exist, so the unreleased pool and the
-- bookable roster are populated on the day they launch instead of empty.
-- Ticking either shares nothing with anyone today.

ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "poolOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "poolOptInAt" TIMESTAMP(3);

ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "bookingsOpen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "bookingsOpenAt" TIMESTAMP(3);
