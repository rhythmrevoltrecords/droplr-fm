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

export async function platformAdmin() {
  const user = await getCurrentUser();
  if (!user || !platformAdminEmails().includes(user.email.toLowerCase())) return null;
  return user;
}

/** Pages: 404 (not 403) for everyone else, so the page's existence isn't advertised. */
export async function requirePlatformAdmin() {
  const user = await platformAdmin();
  if (!user) notFound();
  return user;
}
