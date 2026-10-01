import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionCookie, isLabelRole, verifyPassword } from "@/lib/auth";
import { clear, emailIpKey, emailKey, forget, hit, ipKey } from "@/lib/throttle";
import { clientIp } from "@/lib/tracking";
import { redirectTo } from "@/lib/redirect";

const WINDOW = 15 * 60 * 1000;
// bcrypt hash (cost 12, same as hashPassword) of a random string nobody knows.
const DUMMY_HASH = "$2b$12$2Q.5DzAycWbE1QGwx0jFKufdWanRGijF9bxrcysBCobw1mm/rARgC";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "");
  const fail = (code: string) => redirectTo(`/login?error=${code}${next ? `&next=${encodeURIComponent(next)}` : ""}`);

  // Recorded BEFORE checking the password so parallel guesses can't all slip past the count; a successful
  // login removes its own attempts again (only failures count).
  //  - 10 per account *from one IP* in 15 min: the tight limit on a guesser.
  //  - 30 per IP in 15 min: one source spraying many accounts.
  //  - 200 per account per hour from anywhere: the backstop against a guesser rotating IPs.
  // The per-account limit used to be IP-blind at 10, so anyone who knew a label owner's address could keep
  // them locked out with 10 bad POSTs every 15 minutes from anywhere. Now that costs 200 an hour from many
  // IPs, and the owner's own IP is unaffected below that. With bcrypt-12 and a 10-character minimum,
  // 200 guesses an hour is not a meaningful brute force.
  const ip = clientIp(req.headers);
  const eKey = emailKey("login", email);
  const eiKey = emailIpKey("login", email, ip);
  const iKey = ipKey("login", ip);
  // The per-account backstop only counts attempts that got past the per-IP limits: otherwise one IP
  // hammering away (already refused) would still fill the 200 and lock the owner out everywhere.
  const [ei, i] = await Promise.all([hit(eiKey, 10, WINDOW), hit(iKey, 30, WINDOW)]);
  if (!ei.ok || !i.ok) return fail("locked");
  const e = await hit(eKey, 200, 60 * 60 * 1000);
  if (!e.ok) return fail("locked");

  const user = await prisma.user.findUnique({ where: { email } });
  // Unknown email still pays for a bcrypt compare so response time doesn't reveal which accounts exist.
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return fail("1");
  await forget([e.id, ei.id, i.id]);
  await clear(eiKey);
  await createSessionCookie(user);
  const home = isLabelRole(user.role) ? "/admin" : "/dashboard";
  // Only same-site relative paths, never "//evil.com".
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "";
  const dest = safeNext.startsWith("/admin") && isLabelRole(user.role) ? safeNext : safeNext.startsWith("/dashboard") && !isLabelRole(user.role) ? safeNext : home;
  return redirectTo(dest);
}
