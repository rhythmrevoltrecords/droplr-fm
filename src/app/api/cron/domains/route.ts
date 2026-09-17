import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { runDomainChecks } from "@/lib/domains";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Manual / local trigger for the domain-check scheduled function. curl -X POST -H "x-cron-secret: $CRON_SECRET" …/api/cron/domains */
export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || !safeEqual(req.headers.get("x-cron-secret") ?? "", process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await runDomainChecks(Date.now() + 50_000));
}
