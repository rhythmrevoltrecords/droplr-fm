import { accountEmailConfigured, sendAccountEmail, verifyEmailEmail } from "./account-email";
import { randomToken, sha256 } from "./crypto";
import { prisma } from "./db";
import { SITE_URL } from "./env";

/**
 * Email verification. A new account (signup or accepted invite) can use droplr straight away, but until the owner of
 * the address clicks the emailed link it can't invite people, connect a custom domain or a Spotify app, or reach /platform.
 * Invite links are shown to the person who sent the invite, so accepting one doesn't prove anything about the address.
 */
export const VERIFY_TTL_MS = 48 * 3600_000;
export const UNVERIFIED_ERROR = "Confirm your email address first. We sent you a link; you can resend it from the banner at the top of the page.";

export const isVerified = (user: { emailVerifiedAt: Date | null }) => !!user.emailVerifiedAt;

export async function createVerificationToken(user: { id: string; email: string }) {
  const token = randomToken(24);
  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.emailVerificationToken.create({ data: { userId: user.id, email: user.email, tokenHash: sha256(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) } }),
  ]);
  return token;
}

/** Best effort: signup and invite acceptance never fail because email is down. Returns whether it was sent. */
export async function sendVerificationEmail(user: { id: string; email: string; emailVerifiedAt: Date | null }) {
  if (user.emailVerifiedAt || !accountEmailConfigured()) return false;
  const token = await createVerificationToken(user);
  try {
    await sendAccountEmail({ to: user.email, ...verifyEmailEmail(`${SITE_URL}/api/auth/verify-email?t=${token}`) });
    return true;
  } catch (e) {
    console.error("[verify-email] send failed", { user: user.id, error: (e as Error).message });
    return false;
  }
}

export type VerifyResult = { ok: true; userId: string; role: string } | { ok: false };

export async function consumeVerificationToken(token: string): Promise<VerifyResult> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { ok: false };
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date() || record.email !== record.user.email) return { ok: false };
  const claimed = await prisma.emailVerificationToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) return { ok: false };
  if (!record.user.emailVerifiedAt) await prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
  return { ok: true, userId: record.userId, role: record.user.role };
}
