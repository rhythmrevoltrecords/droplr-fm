import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { signToken, verifyToken } from "./crypto";

export const SESSION_COOKIE = "dfm_session";
export type Role = "owner" | "admin" | "artist";
export type SessionPayload = { sub: string; org: string; role: Role; iat?: number; exp?: number; jti?: string };

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);

export const MIN_PASSWORD = 10;
/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(pw: string, email?: string | null): string | null {
  if (pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters`;
  if (pw.length > 200) return "Password is too long";
  if (email && pw.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4) return "Password can't contain your email name";
  if (/^(.)\1+$/.test(pw)) return "Password can't be one repeated character";
  return null;
}

/** Sessions issued before this instant stop working. Second precision, because JWT iat is in seconds. */
export const sessionCutoffNow = () => new Date(Math.floor(Date.now() / 1000) * 1000);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function createSessionCookie(user: { id: string; organizationId: string; role: string }) {
  // jti: lets "Log out" revoke this one session (RevokedSession) without signing out every device.
  const token = await signToken({ sub: user.id, org: user.organizationId, role: user.role, jti: crypto.randomUUID() }, "30d", "session");
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Log out: revoke this session server-side, then drop the cookie. Deleting the cookie alone left a
 * copied token valid for up to 30 days. Other devices stay signed in ("sign out everywhere" is separate).
 */
export async function endSession() {
  try {
    const s = await getSession();
    if (s?.jti && typeof s.jti === "string") {
      const expiresAt = new Date(typeof s.exp === "number" ? s.exp * 1000 : Date.now() + 30 * 86_400_000);
      await prisma.revokedSession.upsert({ where: { jti: s.jti }, create: { jti: s.jti, expiresAt }, update: {} });
      if (Math.random() < 0.05) await prisma.revokedSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
    }
  } catch (e) {
    // A database blip must never stop someone logging out of this browser.
    console.error("[logout] couldn't record revocation", e);
  } finally {
    await clearSession();
  }
}

export async function getSession() {
  return verifyToken<SessionPayload>((await cookies()).get(SESSION_COOKIE)?.value, "session");
}

/**
 * Logged-in user with their organization, or null.
 * Null (→ /login or 401) when there's no/expired session, the user was deleted, or the account has
 * no organization (e.g. a hand-made test account). Database errors are NOT swallowed: those should
 * surface as a real error, not as a silent logout loop.
 */
export async function getCurrentUser() {
  const s = await getSession();
  if (!s?.sub || typeof s.sub !== "string") return null;
  const [user, revoked] = await Promise.all([
    prisma.user.findUnique({ where: { id: s.sub }, include: { organization: true } }),
    typeof s.jti === "string" ? prisma.revokedSession.findUnique({ where: { jti: s.jti }, select: { jti: true } }) : null,
  ]);
  if (revoked) return null; // logged out on this device
  if (!user || !user.organizationId || !user.organization) return null;
  // Revoked by a password change/reset or "sign out everywhere".
  if (user.sessionsValidFrom && (typeof s.iat !== "number" || s.iat * 1000 < user.sessionsValidFrom.getTime())) return null;
  return user as typeof user & { organization: NonNullable<typeof user.organization> };
}

export const isLabelRole = (role: string) => role === "owner" || role === "admin";

/** For pages: redirect when unauthorised. */
export async function requireUser(kind: "label" | "artist" | "any" = "any") {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (kind === "label" && !isLabelRole(user.role)) redirect("/dashboard");
  if (kind === "artist" && isLabelRole(user.role)) redirect("/admin");
  return user;
}

/** For route handlers: returns null when unauthorised. */
export async function apiUser(kind: "label" | "any" = "any") {
  const user = await getCurrentUser();
  if (!user) return null;
  if (kind === "label" && !isLabelRole(user.role)) return null;
  return user;
}
