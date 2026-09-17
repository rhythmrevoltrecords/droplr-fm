import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { runReferralChecks } from "@/lib/referrals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Manual / local trigger for the daily referrals scheduled function. curl -X POST -H "x-cron-secret: $CRON_SECRET" …/api/cron/referrals */
export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || !safeEqual(req.headers.get("x-cron-secret") ?? "", process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await runReferralChecks({ deadline: Date.now() + 50_000 }));
}
