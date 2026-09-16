import { NextResponse, type NextRequest } from "next/server";
import { accountEmailConfigured, passwordChangedEmail, sendAccountEmail } from "@/lib/account-email";
import { apiUser, createSessionCookie, hashPassword, passwordProblem, sessionCutoffNow, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { allow } from "@/lib/throttle";

export const dynamic = "force-dynamic";

/** JSON POST { currentPassword, newPassword } → changes the password and signs out every other device. */
export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await allow(`password-change:user:${user.id}`, 10, 60 * 60 * 1000))) return NextResponse.json({ error: "Too many attempts. Try again in an hour." }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as { currentPassword?: unknown; newPassword?: unknown };
  const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const next = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!(await verifyPassword(current, user.passwordHash))) return NextResponse.json({ error: "Current password is wrong" }, { status: 400 });
  if (current === next) return NextResponse.json({ error: "New password must be different" }, { status: 400 });
  const problem = passwordProblem(next, user.email);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), sessionsValidFrom: sessionCutoffNow() } });
  await createSessionCookie(user); // keep this browser signed in
  if (accountEmailConfigured()) await sendAccountEmail({ to: user.email, ...passwordChangedEmail(new Date()) }).catch((e) => console.error("[password] notice failed", e));
  return NextResponse.json({ ok: true });
}
