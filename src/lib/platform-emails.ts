/**
 * Who droplr's own admins are, by address.
 *
 * Split out of platform.ts because that module is `server-only` (it reads the session and calls
 * notFound()), which makes it unimportable from anything a test or a shared library touches. This
 * half is pure env parsing with no request context, so it can be imported anywhere — and keeping
 * one implementation matters: two copies of "who counts as an admin" is how a check drifts.
 *
 * PLATFORM_ADMIN_EMAILS = comma-separated login emails, set in Netlify env. Empty = nobody.
 */
export function platformAdminEmails() {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export const isPlatformAdminEmail = (email: string) => platformAdminEmails().includes(email.trim().toLowerCase());

/** Shown when someone tries to register (sign up / invite) a platform admin address. */
export const RESERVED_EMAIL_ERROR = "That email can't be used here. Contact support@droplr.fm.";
