import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isReferralCode, REFERRAL_COOKIE } from "@/lib/referrals";

export const dynamic = "force-dynamic";

/** Referral link droplr.fm/join/{code}: remember the code for 30 days, then go to sign-up (as the same account type as the referrer). */
export async function GET(_req: NextRequest, props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  const c = code.toLowerCase();
  const referrer = isReferralCode(c) ? await prisma.organization.findUnique({ where: { referralCode: c }, select: { kind: true } }) : null;
  // Relative Location: stays on whatever host the browser used (see lib/redirect.ts).
  const res = new NextResponse(null, { status: 307, headers: { Location: `/signup?type=${referrer?.kind === "label" ? "label" : "artist"}${referrer ? "&ref=1" : ""}`, "Cache-Control": "no-store" } });
  if (referrer) res.cookies.set(REFERRAL_COOKIE, c, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
  return res;
}
