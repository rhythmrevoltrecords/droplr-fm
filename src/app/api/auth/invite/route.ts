import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionCookie, hashPassword, isLabelRole } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";

/** Accept an invite: set password → logged in as artist (or admin). */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const invite = await prisma.invite.findUnique({ where: { tokenHash: sha256(token) } });
  const back = (msg: string) => NextResponse.redirect(new URL(`/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(msg)}`, req.url), 303);
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) return back("This invite is invalid or expired");
  if (password.length < 10) return back("Password must be at least 10 characters");
  if (await prisma.user.findUnique({ where: { email: invite.email } })) return back("An account with this email already exists. Log in instead.");

  const user = await prisma.user.create({
    data: { email: invite.email, passwordHash: await hashPassword(password), role: invite.role, artistName: invite.artistName, organizationId: invite.organizationId },
  });
  await prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  await createSessionCookie(user);
  return NextResponse.redirect(new URL(isLabelRole(user.role) ? "/admin" : "/dashboard", req.url), 303);
}
