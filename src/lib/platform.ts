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

export async function platformAdmin() {
  const user = await getCurrentUser();
  // Email alone isn't proof: must also be the label owner account, with the address confirmed by email.
  if (!user || user.role !== "owner" || !user.emailVerifiedAt || !isPlatformAdminEmail(user.email)) return null;
  return user;
}

/** Pages: 404 (not 403) for everyone else, so the page's existence isn't advertised. */
export async function requirePlatformAdmin() {
  const user = await platformAdmin();
  if (!user) notFound();
  return user;
}
