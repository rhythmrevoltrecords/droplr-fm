import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionCookie, isLabelRole, verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.redirect(new URL("/login?error=1", req.url), 303);
  }
  await createSessionCookie(user);
  const home = isLabelRole(user.role) ? "/admin" : "/dashboard";
  const dest = next.startsWith("/admin") && isLabelRole(user.role) ? next : next.startsWith("/dashboard") ? next : home;
  return NextResponse.redirect(new URL(dest, req.url), 303);
}
