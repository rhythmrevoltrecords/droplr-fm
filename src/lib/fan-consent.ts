import { prisma } from "@/lib/db";
import { FAN_EMAIL_CONSENT_VERSION } from "@/lib/legal";

/**
 * Has this address told this label to stop? One definition, used everywhere a fan email is captured
 * (pre-save form, download gate, Spotify / Deezer pre-save) and again at send time.
 *
 * Unsubscribing writes `emailConsent: false` on every pre-save row for the address and label, but only
 * sets `status: "unsubscribed"` on `platform: "email"` rows — so a fan who only ever pre-saved through
 * Spotify or Deezer left no "unsubscribed" row behind, and the old status-only check let the next
 * pre-save (anyone can type an address) re-consent them. A row that has an email but no consent can
 * only get that way by an opt-out: every capture path writes consent with the address. An imported
 * contact's opt-out lives on FanContact.
 */
export async function optedOutAmong(emails: string[], organizationId: string): Promise<Set<string>> {
  const list = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!list.length) return new Set();
  const [rows, contacts] = await Promise.all([
    prisma.preSave.findMany({
      where: {
        email: { in: list, mode: "insensitive" },
        release: { organizationId },
        OR: [{ status: "unsubscribed" }, { emailConsent: false }],
      },
      select: { email: true },
      distinct: ["email"],
    }),
    prisma.fanContact.findMany({
      where: { organizationId, email: { in: list, mode: "insensitive" }, status: "unsubscribed" },
      select: { email: true },
    }),
  ]);
  return new Set([...rows, ...contacts].map((r) => r.email!.toLowerCase()));
}

export async function isOptedOut(email: string, organizationId: string) {
  return (await optedOutAmong([email], organizationId)).size > 0;
}

/**
 * Email consent captured on the way into a Spotify / Deezer pre-save (the form's email + ticked box,
 * carried through OAuth state). Every consented row records *which wording* and *when*, the same as
 * the email form — a consent flag with no version can't answer "what did this person agree to".
 * Someone who opted out of this label is not re-consented by a pre-save.
 */
export async function oauthEmailConsent(email: string | null | undefined, organizationId: string) {
  if (!email) return null;
  if (await isOptedOut(email, organizationId)) return null;
  return { email, emailConsent: true as const, consentAt: new Date(), consentVersion: FAN_EMAIL_CONSENT_VERSION };
}
