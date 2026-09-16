import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionCookie, isLabelRole, verifyPassword } from "@/lib/auth";
import { clear, emailKey, ipKey, over, record } from "@/lib/throttle";
import { clientIp } from "@/lib/tracking";

const WINDOW = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "");
  const fail = (code: string) => NextResponse.redirect(new URL(`/login?error=${code}${next ? `&next=${encodeURIComponent(next)}` : ""}`, req.url), 303);

  // Failed attempts only: 10 per account and 30 per IP in 15 minutes.
  const eKey = emailKey("login", email);
  const iKey = ipKey("login", clientIp(req.headers));
  if ((await over(eKey, 10, WINDOW)) || (await over(iKey, 30, WINDOW))) return fail("locked");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await Promise.all([record(eKey), record(iKey)]);
    return fail("1");
  }
  await clear(eKey);
  await createSessionCookie(user);
  const home = isLabelRole(user.role) ? "/admin" : "/dashboard";
  // Only same-site relative paths, never "//evil.com".
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "";
  const dest = safeNext.startsWith("/admin") && isLabelRole(user.role) ? safeNext : safeNext.startsWith("/dashboard") && !isLabelRole(user.role) ? safeNext : home;
  return NextResponse.redirect(new URL(dest, req.url), 303);
}
