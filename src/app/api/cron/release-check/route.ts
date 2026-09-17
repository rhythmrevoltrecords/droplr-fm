import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { findDueReleases, processRelease } from "@/lib/presave-processor";
import { notifyLiveReleases } from "@/lib/push-live";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manual / local trigger for the same work the Netlify scheduled + background functions do.
 * curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:8888/api/cron/release-check
 * Runs inline with a short deadline — production uses the 15-minute background function.
 */
export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || !safeEqual(req.headers.get("x-cron-secret") ?? "", process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const live = await notifyLiveReleases().catch(() => 0);
  const due = await findDueReleases();
  const deadline = Date.now() + 50_000;
  const results = [];
  for (const r of due) {
    if (Date.now() > deadline) break;
    results.push(await processRelease(r.id, deadline));
  }
  return NextResponse.json({ due: due.length, live, results });
}
