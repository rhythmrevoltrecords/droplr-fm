import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { allow, ipKey } from "@/lib/throttle";
import { clientIp } from "@/lib/tracking";
import { redirectTo } from "@/lib/redirect";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Form POST { email, label?, website(honeypot) } → pre-launch waitlist (waitlist_features, feature "launch"). */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const back = (q: string) => redirectTo(`/signup?${q}`);
  if (form.get("website")) return back("waitlisted=1"); // bots
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return back("waitlist_error=1");
  if (!(await allow(ipKey("waitlist", clientIp(req.headers)), 10, 60 * 60 * 1000))) return back("waitlisted=1");

  await prisma.waitlistFeature.upsert({
    where: { email_featureName: { email, featureName: "launch" } },
    update: {},
    create: { email, featureName: "launch" },
  });
  return back("waitlisted=1");
}
