-- A tally of clips rendered in the browser (api/admin/clips/rendered). Anonymous on purpose: only
-- the style, whether it was one of droplr's own accounts, and when. No account, release, length,
-- audio or video. Additive only; idempotent.

CREATE TABLE IF NOT EXISTS "ClipRender" (
  "id"        TEXT NOT NULL,
  "style"     TEXT NOT NULL,
  "internal"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClipRender_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClipRender_createdAt_idx" ON "ClipRender"("createdAt");
