import { NextResponse, type NextRequest } from "next/server";
import { accountEmailConfigured } from "@/lib/account-email";
import { getCurrentUser, isLabelRole } from "@/lib/auth";
import { consumeVerificationToken, sendVerificationEmail } from "@/lib/email-verification";
import { hit } from "@/lib/throttle";
import { redirectTo } from "@/lib/redirect";

export const dynamic = "force-dynamic";

/** GET ?t=<token>: the link in the email. */
export async function GET(req: NextRequest) {
  const result = await consumeVerificationToken(req.nextUrl.searchParams.get("t") ?? "");
  if (!result.ok) return redirectTo("/login?verify=invalid");
  const current = await getCurrentUser();
  if (current?.id === result.userId) return redirectTo(`${isLabelRole(current.role) ? "/admin" : "/dashboard"}?verified=1`);
  return redirectTo("/login?verified=1");
}

/** POST: resend the link to the signed-in account (3 per hour). */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, message: "Your email is already confirmed." });
  if (!accountEmailConfigured()) return NextResponse.json({ error: "Email isn't set up on this deployment." }, { status: 503 });
  if (!(await hit(`verify-resend:${user.id}`, 3, 60 * 60_000)).ok) return NextResponse.json({ error: "Sent a few already. Check your spam folder, or try again in an hour." }, { status: 429 });
  const sent = await sendVerificationEmail(user);
  if (!sent) return NextResponse.json({ error: "Couldn't send the email just now. Try again shortly." }, { status: 502 });
  return NextResponse.json({ ok: true, message: `Sent to ${user.email}. The link works for 48 hours.` });
}
