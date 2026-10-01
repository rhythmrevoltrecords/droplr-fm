import "server-only";
import { notFound } from "next/navigation";
import { getCurrentUser } from "./auth";

/**
 * Platform owner (you, running droplr.fm), not a label role. The address list itself lives in
 * platform-emails.ts so it can be imported outside a request; re-exported here so every existing
 * caller keeps working and there is still one definition of who counts.
 */
export { isPlatformAdminEmail, platformAdminEmails, RESERVED_EMAIL_ERROR } from "./platform-emails";
import { isPlatformAdminEmail } from "./platform-emails";

/**
 * The same rule, for a caller that already has the user loaded — the admin layout decides whether
 * to show the Platform nav link and shouldn't fetch the user twice to find out. Exported so there
 * stays exactly one definition of who counts: platformAdmin() below is this plus the fetch.
 */
export function isPlatformAdminUser(u: { role: string; emailVerifiedAt: Date | null; email: string } | null | undefined) {
  // Email alone isn't proof: must also be the label owner account, with the address confirmed by email.
  return !!u && u.role === "owner" && !!u.emailVerifiedAt && isPlatformAdminEmail(u.email);
}

export async function platformAdmin() {
  const user = await getCurrentUser();
  return isPlatformAdminUser(user) ? user : null;
}

/** Pages: 404 (not 403) for everyone else, so the page's existence isn't advertised. */
export async function requirePlatformAdmin() {
  const user = await platformAdmin();
  if (!user) notFound();
  return user;
}
