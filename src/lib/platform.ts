import "server-only";
import { notFound } from "next/navigation";
import { getCurrentUser } from "./auth";

/**
 * Platform owner (you, running droplr.fm), not a label role.
 * PLATFORM_ADMIN_EMAILS = comma-separated login emails, set in Netlify env. Empty = nobody.
 */
export function platformAdminEmails() {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export const isPlatformAdminEmail = (email: string) => platformAdminEmails().includes(email.trim().toLowerCase());

/** Shown when someone tries to register (sign up / invite) a platform admin address. */
export const RESERVED_EMAIL_ERROR = "That email can't be used here. Contact support@droplr.fm.";

export async function platformAdmin() {
  const user = await getCurrentUser();
  // Email alone isn't proof (addresses aren't verified at signup): must also be the label owner account.
  if (!user || user.role !== "owner" || !isPlatformAdminEmail(user.email)) return null;
  return user;
}

/** Pages: 404 (not 403) for everyone else, so the page's existence isn't advertised. */
export async function requirePlatformAdmin() {
  const user = await platformAdmin();
  if (!user) notFound();
  return user;
}
