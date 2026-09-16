import type { Context } from "@netlify/functions";
import { safeEqual } from "../../src/lib/crypto";
import { processRelease } from "../../src/lib/presave-processor";

// Background function (the "-background" suffix gives it a 15 minute limit).
// Loops releases, processes BYO Spotify saves with concurrency 50 + 429 backoff,
// then sends release-day emails. Stops at ~14 minutes and re-invokes itself if work remains.
export default async (req: Request, _context: Context) => {
  if (!process.env.CRON_SECRET || !safeEqual(req.headers.get("x-cron-secret") ?? "", process.env.CRON_SECRET)) {
    console.warn("[process-presaves] rejected: bad cron secret");
    return;
  }
  const { releaseIds = [] } = (await req.json().catch(() => ({}))) as { releaseIds?: string[] };
  const deadline = Date.now() + 14 * 60 * 1000;
  const leftovers: string[] = [];

  for (const id of releaseIds) {
    if (Date.now() > deadline) {
      leftovers.push(id);
      continue;
    }
    try {
      const result = await processRelease(id, deadline);
      console.log("[process-presaves]", JSON.stringify(result));
      if (result.stoppedEarly && !result.notes.some((n) => n.includes("QUOTA_EXCEEDED"))) leftovers.push(id);
    } catch (e) {
      console.error(`[process-presaves] release ${id} failed`, e);
    }
  }

  if (leftovers.length) {
    const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL;
    await fetch(`${base}/.netlify/functions/process-presaves-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": process.env.CRON_SECRET ?? "" },
      body: JSON.stringify({ releaseIds: leftovers }),
    });
  }
};
