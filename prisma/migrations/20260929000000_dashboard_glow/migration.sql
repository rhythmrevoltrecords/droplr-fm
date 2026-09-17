-- Soft accent-colour gradient behind dashboards (on by default; switch in Settings → Appearance).
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "dashboardGlow" BOOLEAN NOT NULL DEFAULT true;
