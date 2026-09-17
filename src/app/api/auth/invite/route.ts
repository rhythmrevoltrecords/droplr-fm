import type { NextRequest } from "next/server";
import { syncReleaseAccess } from "@/lib/artists";
import { prisma } from "@/lib/db";
import { createSessionCookie, hashPassword, isLabelRole, passwordProblem } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { sendVerificationEmail } from "@/lib/email-verification";
import { LEGAL } from "@/lib/legal";
import { isPlatformAdminEmail, RESERVED_EMAIL_ERROR } from "@/lib/platform";
import { redirectTo } from "@/lib/redirect";

/** Accept an invite: set password → logged in as artist (or admin). */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const invite = await prisma.invite.findUnique({ where: { tokenHash: sha256(token) } });
  const back = (msg: string) => redirectTo(`/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(msg)}`);
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) return back("This invite is invalid or expired");
  const problem = passwordProblem(password, invite.email);
  if (problem) return back(problem);
  if (form.get("terms") !== "yes") return back("Please agree to the Terms of Service and Privacy Policy");
  if (await prisma.user.findUnique({ where: { email: invite.email } })) return back("An account with this email already exists. Log in instead.");
  // Invites created before the platform admin block existed.
  if (isPlatformAdminEmail(invite.email)) return back(RESERVED_EMAIL_ERROR);

  const user = await prisma.user.create({
    data: { email: invite.email, passwordHash: await hashPassword(password), role: invite.role, artistName: invite.artistName, organizationId: invite.organizationId, termsAcceptedAt: new Date(), termsVersion: LEGAL.version },
  });
  await prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  if (user.role === "artist") await linkArtistProfile(invite, user);
  // The invite link was also shown to whoever sent it, so it doesn't prove this address: confirm by email.
  await sendVerificationEmail(user);
  await createSessionCookie(user);
  return redirectTo(isLabelRole(user.role) ? "/admin" : "/dashboard");
}

/** Every artist login belongs to a roster profile: link the invited one, or create one for a generic invite. */
async function linkArtistProfile(
  invite: { organizationId: string; email: string; artistName: string | null; artistProfileId: string | null },
  user: { id: string },
) {
  if (invite.artistProfileId) {
    // Only claim a profile that has no login yet: never move a profile away from an existing account.
    const linked = await prisma.artist.updateMany({ where: { id: invite.artistProfileId, organizationId: invite.organizationId, userId: null }, data: { userId: user.id } });
    if (linked.count) await syncReleaseAccess(invite.artistProfileId);
    return;
  }
  await prisma.artist.create({
    data: { organizationId: invite.organizationId, name: invite.artistName?.trim() || invite.email.split("@")[0], email: invite.email, userId: user.id },
  });
}
