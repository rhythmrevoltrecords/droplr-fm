// Relative imports only: also called from lib/esp, which the sync job bundles outside Next.
import { prisma } from "./db";

export type ConsentEventKind = "unsubscribe" | "restore" | "confirm";
export type ConsentEventVia = "link" | "one-click" | "esp";

/**
 * Write down that a fan opted out of (or back in to, or confirmed) an account's emails, and when. Append-only:
 * the current state lives on PreSave and FanContact, this is the history behind it. Never throws;
 * a failed log line must not stop the opt-out itself.
 */
export async function recordConsentEvent(organizationId: string, email: string, kind: ConsentEventKind, via: ConsentEventVia): Promise<void> {
  await prisma.consentEvent
    .create({ data: { organizationId, email: email.trim().toLowerCase(), kind, via } })
    .catch((e) => console.error("[consent-event]", e instanceof Error ? e.message : e));
}
