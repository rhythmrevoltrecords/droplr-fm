import { randomToken, sha256 } from "./crypto";
import { prisma } from "./db";
import { SITE_URL } from "./env";
import { isPlatformAdminEmail, RESERVED_EMAIL_ERROR } from "./platform";

export const INVITE_TTL_MS = 14 * 86400_000;
export const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

type InviteResult = { ok: true; link: string; inviteId: string } | { ok: false; error: string; status: 400 | 409 };

/**
 * Shared by the generic invite form (/api/admin/artists) and "Invite to log in" on a roster profile.
 * Plan limits are checked by the caller: a profile invite is already counted, a generic one isn't.
 * The token is only ever returned once; the database keeps its hash.
 */
export async function createInvite(input: { organizationId: string; email: string; artistName?: string | null; role: "artist" | "admin"; artistProfileId?: string | null }): Promise<InviteResult> {
  const email = input.email.trim().toLowerCase();
  if (!isEmail(email)) return { ok: false, error: "Valid email required", status: 400 };
  if (await prisma.user.findUnique({ where: { email } })) return { ok: false, error: "That email already has a droplr.fm account", status: 409 };
  if (isPlatformAdminEmail(email)) return { ok: false, error: RESERVED_EMAIL_ERROR, status: 400 };

  const token = randomToken(24);
  const invite = await prisma.invite.create({
    data: {
      organizationId: input.organizationId,
      email,
      artistName: input.artistName?.trim() || null,
      role: input.role,
      artistProfileId: input.artistProfileId ?? null,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });
  return { ok: true, link: `${SITE_URL}/invite/${token}`, inviteId: invite.id };
}
