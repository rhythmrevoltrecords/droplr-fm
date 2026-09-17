import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionCookie, hashPassword, passwordProblem } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email-verification";
import { canSignUp } from "@/lib/launch";
import { LEGAL } from "@/lib/legal";
import { isPlatformAdminEmail, RESERVED_EMAIL_ERROR } from "@/lib/platform";
import { allow, ipKey } from "@/lib/throttle";
import { clientIp } from "@/lib/tracking";
import { RESERVED_SLUGS, slugify } from "@/lib/utils";
import { redirectTo } from "@/lib/redirect";
import { attachReferral, REFERRAL_COOKIE } from "@/lib/referrals";
import { claimInvite, findUsableInvite } from "@/lib/signup-invites";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const name = String(form.get("orgName") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const inviteCode = form.get("inviteCode");
  // An owner invite can fix the account type; the form value can't override it.
  const preInvite = typeof inviteCode === "string" && inviteCode ? await findUsableInvite(inviteCode) : null;
  const kind = preInvite?.ok && preInvite.invite.kind === "artist" ? "artist" : preInvite?.ok && preInvite.invite.kind === "label" ? "label" : form.get("kind") === "artist" ? "artist" : "label";
  const planParam = String(form.get("plan") ?? "");
  const plan = kind === "artist" ? (planParam === "artist" || planParam === "artist_pro" ? planParam : "") : planParam === "pro" || planParam === "label" ? planParam : "";
  const fail = (msg: string) => redirectTo(`/signup?type=${kind}&invite=1&error=${encodeURIComponent(msg)}${plan ? `&plan=${plan}` : ""}${preInvite?.ok ? `&code=${encodeURIComponent(String(inviteCode))}` : ""}`);
  if (name.length < 2 || name.length > 100) return fail(kind === "artist" ? "Artist name is required" : "Label name is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Valid email required");
  // Pre-launch: env allowlist, or an owner invite (bound invites only work for their own address).
  const invite = typeof inviteCode === "string" && inviteCode ? await findUsableInvite(inviteCode, email) : null;
  if (invite && !invite.ok && invite.reason === "email") return fail("This invite is for a different email address. Use the address it was sent to.");
  if (!canSignUp(email) && !invite?.ok) return redirectTo(typeof inviteCode === "string" && inviteCode ? `/signup?code=${encodeURIComponent(inviteCode)}` : "/signup?closed=1");
  const problem = passwordProblem(password, email);
  if (problem) return fail(problem);
  if (form.get("terms") !== "yes") return fail("Please agree to the Terms of Service and Privacy Policy");
  // 5 attempts per IP per hour, counted after simple form mistakes but before the account lookup (enumeration).
  if (!(await allow(ipKey("signup", clientIp(req.headers)), 5, 60 * 60 * 1000))) return fail("Too many sign-ups from this network. Try again in an hour.");
  if (await prisma.user.findUnique({ where: { email } })) return fail("That email already has an account");
  // Platform admin addresses can never be registered fresh (email isn't verified at signup).
  if (isPlatformAdminEmail(email)) return fail(RESERVED_EMAIL_ERROR);

  let slug = slugify(name) || kind;
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-${kind}`;
  // Also skip slugs another label used before a rename: those still redirect to that label.
  const taken = async (s: string) => !!(await prisma.organization.findFirst({ where: { OR: [{ slug: s }, { previousSlugs: { has: s } }] }, select: { id: true } }));
  for (let i = 2; await taken(slug); i++) slug = `${slugify(name) || kind}-${i}`;

  // Use up one invite slot at the last moment, atomically (open links have a limit).
  const usingInvite = invite?.ok ? invite.invite : null;
  if (usingInvite && !(await claimInvite(usingInvite.id))) return fail("That invite link was just used up. Ask for a new one.");

  const org = await prisma.organization
    .create({
    data: {
      name, slug, kind, emailFromName: name,
      ...(usingInvite ? { signupInviteId: usingInvite.id } : {}), // invited accounts start on Free, like everyone
      // An artist account is its own roster of one: the profile holds the artist's bio, photos and stats.
      ...(kind === "artist" ? { artists: { create: { name, email } } } : {}),
      users: { create: { email, passwordHash: await hashPassword(password), role: "owner", termsAcceptedAt: new Date(), termsVersion: LEGAL.version } },
    },
    include: { users: true },
    })
    .catch(async (e) => {
      // Give the invite slot back if the account couldn't be made (e.g. a slug race), then fail as before.
      if (usingInvite) await prisma.signupInvite.update({ where: { id: usingInvite.id }, data: { uses: { decrement: 1 } } }).catch(() => {});
      throw e;
    });
  // Refer a friend: the code from droplr.fm/join/{code} (cookie). Rewards only count once this account pays.
  if (await attachReferral(org.id, req.cookies.get(REFERRAL_COOKIE)?.value)) console.info("[referral] signup", { org: org.id });
  await sendVerificationEmail(org.users[0]);
  await createSessionCookie(org.users[0]);
  const res = redirectTo(plan ? `/admin/settings/billing?plan=${plan}` : "/admin?welcome=1");
  res.cookies.delete(REFERRAL_COOKIE);
  return res;
}
