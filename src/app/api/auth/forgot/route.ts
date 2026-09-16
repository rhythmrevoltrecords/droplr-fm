import { NextResponse, type NextRequest } from "next/server";
import { accountEmailConfigured, resetPasswordEmail, sendAccountEmail } from "@/lib/account-email";
import { randomToken, sha256 } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { allow, emailKey, ipKey } from "@/lib/throttle";
import { clientIp } from "@/lib/tracking";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Form POST { email } → always the same "check your email" page, whether or not the account exists
 * (no account enumeration). Limits: 3 per email and 10 per IP per hour.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const done = NextResponse.redirect(new URL("/forgot-password?sent=1", req.url), 303);
  if (!EMAIL_RE.test(email) || email.length > 254) return NextResponse.redirect(new URL("/forgot-password?error=email", req.url), 303);

  const okIp = await allow(ipKey("reset", clientIp(req.headers)), 10, RESET_TTL_MS);
  const okEmail = okIp && (await allow(emailKey("reset", email), 3, RESET_TTL_MS));
  if (!okIp || !okEmail) return done; // silently: same response as success

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) return done;

  const token = randomToken(32);
  await prisma.$transaction([
    // Only the newest link works.
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } }),
  ]);
  const url = `${SITE_URL}/reset-password?token=${token}`;

  if (!accountEmailConfigured()) {
    if (process.env.NODE_ENV !== "production") console.info(`[forgot-password] email not configured; reset link for ${user.email}: ${url}`);
    else console.error("[forgot-password] RESEND_API_KEY / ACCOUNT_FROM_EMAIL not set; reset email not sent");
    return done;
  }
  try {
    await sendAccountEmail({ to: user.email, ...resetPasswordEmail(url) });
  } catch (err) {
    console.error("[forgot-password] send failed", err);
  }
  return done;
}
