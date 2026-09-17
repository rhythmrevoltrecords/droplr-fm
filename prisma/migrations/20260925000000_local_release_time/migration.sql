-- Release in each fan's own timezone, fan platform choice, store link scans.
-- Additive with defaults; IF NOT EXISTS guards keep it safe to re-run.

-- local = the release unlocks at its wall-clock time (usually midnight) in each fan's timezone, like the stores do.
-- global = one moment worldwide (surprise drops).
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "rollout" TEXT NOT NULL DEFAULT 'local';
-- Last time droplr looked up store links for this release (throttles pre-release and release-day scans).
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "linksCheckedAt" TIMESTAMP(3);

-- Hour (0-23, fan's local time) the release-day email goes out. NULL = as soon as it's out for that fan.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "releaseEmailHour" INTEGER DEFAULT 9;

-- Fan's IANA timezone (browser, else Netlify geo) and the store they said they listen on.
ALTER TABLE "PreSave" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
ALTER TABLE "PreSave" ADD COLUMN IF NOT EXISTS "listenOn" TEXT;
CREATE INDEX IF NOT EXISTS "PreSave_releaseId_timezone_idx" ON "PreSave"("releaseId", "timezone");

-- Lease so two overlapping runs (15-minute schedule + re-invoked background function) never process one release at once.
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "processingUntil" TIMESTAMP(3);
