import { NextResponse, type NextRequest } from "next/server";
import { accountEmailConfigured, passwordChangedEmail, sendAccountEmail } from "@/lib/account-email";
import { createSessionCookie, hashPassword, isLabelRole, passwordProblem, sessionCutoffNow } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Form POST { token, password, confirm } → sets the password, signs out every other session, logs this browser in. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const back = (msg: string) => NextResponse.redirect(new URL(`/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(msg)}`, req.url), 303);

  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return NextResponse.redirect(new URL("/reset-password?error=invalid", req.url), 303);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date()) return NextResponse.redirect(new URL("/reset-password?error=invalid", req.url), 303);

  if (password !== confirm) return back("The two passwords don't match");
  const problem = passwordProblem(password, record.user.email);
  if (problem) return back(problem);

  const cutoff = sessionCutoffNow();
  // Mark used first (conditional on still unused) so a double submit can't reuse the token.
  const claimed = await prisma.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) return NextResponse.redirect(new URL("/reset-password?error=invalid", req.url), 303);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(password), sessionsValidFrom: cutoff } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } }),
  ]);

  if (accountEmailConfigured()) await sendAccountEmail({ to: record.user.email, ...passwordChangedEmail(new Date()) }).catch((e) => console.error("[reset] notice failed", e));
  await createSessionCookie(record.user);
  return NextResponse.redirect(new URL(`${isLabelRole(record.user.role) ? "/admin" : "/dashboard"}?password=reset`, req.url), 303);
}
