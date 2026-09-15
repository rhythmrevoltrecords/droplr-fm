import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { signToken, verifyToken } from "./crypto";

export const SESSION_COOKIE = "dfm_session";
export type Role = "owner" | "admin" | "artist";
export type SessionPayload = { sub: string; org: string; role: Role };

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function createSessionCookie(user: { id: string; organizationId: string; role: string }) {
  const token = await signToken({ sub: user.id, org: user.organizationId, role: user.role }, "30d");
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSession() {
  cookies().delete(SESSION_COOKIE);
}

export async function getSession() {
  return verifyToken<SessionPayload>(cookies().get(SESSION_COOKIE)?.value);
}

export async function getCurrentUser() {
  const s = await getSession();
  if (!s?.sub) return null;
  return prisma.user.findUnique({ where: { id: s.sub }, include: { organization: true } });
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
