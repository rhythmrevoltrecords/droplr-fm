-- Store exclusivity on a release, so droplr can warn when a link it is about to publish breaks it.
--
-- Every column is nullable, so ADD COLUMN IF NOT EXISTS is enough and there is no backfill: a
-- release with no exclusivity set produces no findings at all, which is the common case and the
-- behaviour the validator is tested for.
--
-- exclusiveRulebook is a plain string rather than an enum on purpose. Beatport, LabelWorx and
-- Symphonic publish different rules today and a fourth distributor is a code change, not a
-- migration. Values: beatport | labelworx | symphonic | unknown.
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "exclusiveStore" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "exclusiveFrom" TIMESTAMP(3);
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "exclusiveWeeks" INTEGER;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "exclusiveRulebook" TEXT;
