import { NextResponse } from "next/server";
import { platformAdmin } from "@/lib/platform";
import { runReferralChecks } from "@/lib/referrals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST — platform owner runs the daily referral check now. */
export async function POST() {
  const admin = await platformAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const out = await runReferralChecks({ deadline: Date.now() + 40_000 });
  console.info("[platform] referral check", { ...out, by: admin.email });
  return NextResponse.json(out);
}
