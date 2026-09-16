import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionCookie, hashPassword, passwordProblem } from "@/lib/auth";
import { LEGAL } from "@/lib/legal";
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
  const problem = passwordProblem(password, email);
  if (problem) return fail(problem);
  if (form.get("terms") !== "yes") return fail("Please agree to the Terms of Service and Privacy Policy");
  if (await prisma.user.findUnique({ where: { email } })) return fail("That email already has an account");

  let slug = slugify(name) || "label";
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-label`;
  for (let i = 2; await prisma.organization.findUnique({ where: { slug } }); i++) slug = `${slugify(name)}-${i}`;

  const org = await prisma.organization.create({
    data: { name, slug, emailFromName: name, users: { create: { email, passwordHash: await hashPassword(password), role: "owner", termsAcceptedAt: new Date(), termsVersion: LEGAL.version } } },
    include: { users: true },
  });
  await createSessionCookie(org.users[0]);
  return NextResponse.redirect(new URL(plan ? `/admin/settings/billing?plan=${plan}` : "/admin?welcome=1", req.url), 303);
}
