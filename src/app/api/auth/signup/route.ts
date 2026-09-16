import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionCookie, hashPassword, passwordProblem } from "@/lib/auth";
import { canSignUp } from "@/lib/launch";
import { LEGAL } from "@/lib/legal";
import { isPlatformAdminEmail, RESERVED_EMAIL_ERROR } from "@/lib/platform";
import { allow, ipKey } from "@/lib/throttle";
import { clientIp } from "@/lib/tracking";
import { RESERVED_SLUGS, slugify } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const name = String(form.get("orgName") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const planParam = String(form.get("plan") ?? "");
  const plan = planParam === "pro" || planParam === "label" ? planParam : "";
  const fail = (msg: string) => NextResponse.redirect(new URL(`/signup?error=${encodeURIComponent(msg)}${plan ? `&plan=${plan}` : ""}`, req.url), 303);
  if (name.length < 2) return fail("Label name is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Valid email required");
  // Pre-launch: invite-only (SIGNUPS_OPEN / SIGNUP_ALLOWLIST).
  if (!canSignUp(email)) return NextResponse.redirect(new URL("/signup?closed=1", req.url), 303);
  const problem = passwordProblem(password, email);
  if (problem) return fail(problem);
  if (form.get("terms") !== "yes") return fail("Please agree to the Terms of Service and Privacy Policy");
  // 5 attempts per IP per hour, counted after simple form mistakes but before the account lookup (enumeration).
  if (!(await allow(ipKey("signup", clientIp(req.headers)), 5, 60 * 60 * 1000))) return fail("Too many sign-ups from this network. Try again in an hour.");
  if (await prisma.user.findUnique({ where: { email } })) return fail("That email already has an account");
  // Platform admin addresses can never be registered fresh (email isn't verified at signup).
  if (isPlatformAdminEmail(email)) return fail(RESERVED_EMAIL_ERROR);

  let slug = slugify(name) || "label";
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-label`;
  // Also skip slugs another label used before a rename: those still redirect to that label.
  const taken = async (s: string) => !!(await prisma.organization.findFirst({ where: { OR: [{ slug: s }, { previousSlugs: { has: s } }] }, select: { id: true } }));
  for (let i = 2; await taken(slug); i++) slug = `${slugify(name) || "label"}-${i}`;

  const org = await prisma.organization.create({
    data: { name, slug, emailFromName: name, users: { create: { email, passwordHash: await hashPassword(password), role: "owner", termsAcceptedAt: new Date(), termsVersion: LEGAL.version } } },
    include: { users: true },
  });
  await createSessionCookie(org.users[0]);
  return NextResponse.redirect(new URL(plan ? `/admin/settings/billing?plan=${plan}` : "/admin?welcome=1", req.url), 303);
}
