-- Features still in testing, switched on per account from the owner console. Additive only; idempotent.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "betaFeatures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
