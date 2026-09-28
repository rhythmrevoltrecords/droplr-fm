import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email-verification";
import { isPlatformAdminEmail, RESERVED_EMAIL_ERROR } from "@/lib/platform";
import { hit } from "@/lib/throttle";

export const dynamic = "force-dynamic";

/**
 * Correcting the address on an account that hasn't been confirmed yet.
 *
 * This exists because the confirmation gate would otherwise be a trap. Someone who mistypes their
 * address at signup can never receive the link, and with the gate in front of the dashboard they
 * would have no way back in — on a paid plan, with a support email they can't reach from inside
 * the product. One typo would cost an account.
 *
 * Deliberately narrow:
 *  - only while the current address is unconfirmed. Once confirmed, changing the address is a
 *    different operation with a different threat model (account takeover), and it isn't this one;
 *  - the new address must be free, and can never be a platform admin address — the same rule
 *    signup enforces, for the same reason: nothing here proves who owns the address;
 *  - rate limited, because this endpoint sends an email to an address the caller chooses;
 *  - the old address is not notified, because an unconfirmed address has never been shown to
 *    belong to anyone.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.emailVerifiedAt) return NextResponse.json({ error: "Your email is already confirmed." }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = String(body.email ?? "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (email === user.email) return NextResponse.json({ error: "That's the address we already have. Try Resend instead." }, { status: 400 });
  if (isPlatformAdminEmail(email)) return NextResponse.json({ error: RESERVED_EMAIL_ERROR }, { status: 400 });

  if (!(await hit(`email-change:${user.id}`, 5, 60 * 60_000)).ok) {
    return NextResponse.json({ error: "Changed it a few times already. Try again in an hour, or email support@droplr.fm." }, { status: 429 });
  }
  // Checked before the write and enforced again by the unique index below, so a race can't merge
  // two accounts onto one address.
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return NextResponse.json({ error: "That email already has an account." }, { status: 409 });
  }

  try {
    await prisma.user.update({ where: { id: user.id }, data: { email } });
  } catch {
    return NextResponse.json({ error: "That email already has an account." }, { status: 409 });
  }
  // Any link already sent to the old address is for an address this account no longer has.
  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  const sent = await sendVerificationEmail({ id: user.id, email, emailVerifiedAt: null });
  console.info("[auth] unconfirmed address changed", { user: user.id, sent });
  return NextResponse.json({
    ok: true,
    email,
    message: sent ? `Sent to ${email}. The link works for 48 hours.` : `Saved ${email}, but the email couldn't be sent just now. Try Resend in a moment.`,
  });
}
