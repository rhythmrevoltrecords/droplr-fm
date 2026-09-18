-- First-login walkthrough: remembers who has finished (or skipped) it. Additive.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tourDoneAt" TIMESTAMP(3);
