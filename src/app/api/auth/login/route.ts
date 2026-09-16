import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionCookie, isLabelRole, verifyPassword } from "@/lib/auth";
import { clear, emailKey, forget, hit, ipKey } from "@/lib/throttle";
import { clientIp } from "@/lib/tracking";

const WINDOW = 15 * 60 * 1000;
// bcrypt hash (cost 12, same as hashPassword) of a random string nobody knows.
const DUMMY_HASH = "$2b$12$2Q.5DzAycWbE1QGwx0jFKufdWanRGijF9bxrcysBCobw1mm/rARgC";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "");
  const fail = (code: string) => NextResponse.redirect(new URL(`/login?error=${code}${next ? `&next=${encodeURIComponent(next)}` : ""}`, req.url), 303);

  // 10 per account and 30 per IP in 15 minutes. Recorded BEFORE checking the password so parallel guesses
  // can't all slip past the count; a successful login removes its own attempt again (only failures count).
  const eKey = emailKey("login", email);
  const iKey = ipKey("login", clientIp(req.headers));
  const [e, i] = await Promise.all([hit(eKey, 10, WINDOW), hit(iKey, 30, WINDOW)]);
  if (!e.ok || !i.ok) return fail("locked");

  const user = await prisma.user.findUnique({ where: { email } });
  // Unknown email still pays for a bcrypt compare so response time doesn't reveal which accounts exist.
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return fail("1");
  await forget([e.id, i.id]);
  await clear(eKey);
  await createSessionCookie(user);
  const home = isLabelRole(user.role) ? "/admin" : "/dashboard";
  // Only same-site relative paths, never "//evil.com".
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "";
  const dest = safeNext.startsWith("/admin") && isLabelRole(user.role) ? safeNext : safeNext.startsWith("/dashboard") && !isLabelRole(user.role) ? safeNext : home;
  return NextResponse.redirect(new URL(dest, req.url), 303);
}
