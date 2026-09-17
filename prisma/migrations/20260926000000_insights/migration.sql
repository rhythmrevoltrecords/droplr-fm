-- Visitor timezone on views and clicks (Netlify geo), so "when are fans active" charts use each fan's own clock.
ALTER TABLE "PageView" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
ALTER TABLE "ClickEvent" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
