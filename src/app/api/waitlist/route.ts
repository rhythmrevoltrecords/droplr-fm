import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { COMING_SOON_KEYS, LINK_TYPES } from "@/lib/link-types";
import { allow, ipKey } from "@/lib/throttle";
import { clientIp } from "@/lib/tracking";

/** "Notify me" for coming-soon link types → waitlist_features (email, feature_name). */
export async function POST(req: NextRequest) {
  const user = await apiUser();
  const body = (await req.json().catch(() => ({}))) as { feature?: string; email?: string };
  const feature = body.feature ?? "";
  if (!COMING_SOON_KEYS.includes(feature as (typeof COMING_SOON_KEYS)[number])) {
    return NextResponse.json({ error: "Unknown feature" }, { status: 400 });
  }
  const email = (user?.email ?? body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  // Anyone can post here (no login needed): 10 per IP per hour.
  if (!(await allow(ipKey("waitlist", clientIp(req.headers)), 10, 60 * 60 * 1000))) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

  await prisma.waitlistFeature.upsert({
    where: { email_featureName: { email, featureName: feature } },
    update: {},
    create: { email, featureName: feature, organizationId: user?.organizationId ?? null },
  });
  const name = LINK_TYPES.find((t) => t.key === feature)?.name ?? feature;
  return NextResponse.json({ ok: true, message: `We'll notify you when ${name} launches!` });
}
