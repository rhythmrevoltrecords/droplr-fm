import type { Config } from "@netlify/functions";
import { runReferralChecks } from "../../src/lib/referrals";

// Daily: referred accounts that have paid 30+ days earn their referrer a free month (max 3 a year);
// earned months are applied to the referrer's next invoice, one at a time. Scheduled functions stop at 30s.
export default async () => {
  const out = await runReferralChecks({ deadline: Date.now() + 22_000 });
  console.log("[referrals]", out);
  return new Response(JSON.stringify(out), { status: 200 });
};

// 03:17 UTC = 13:17 Brisbane, away from the release-day email rush.
export const config: Config = { schedule: "17 3 * * *" };
