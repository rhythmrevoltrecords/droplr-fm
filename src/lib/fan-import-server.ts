import { randomToken } from "./crypto";
import { prisma } from "./db";
import type { ConsentKind, ParsedContact } from "./fan-import";

/**
 * The database half of importing a list. Server only — see fan-import.ts for why the split
 * exists (the upload form is a client component and must not pull pg into the browser).
 */
export type ImportResult = {
  importId: string;
  added: number;
  /** Already in this org's contacts — left exactly as they were, including their status. */
  duplicates: number;
  /** Already a droplr fan of this org through a real pre-save. Not touched: that record is better. */
  alreadyFans: number;
  /** Previously unsubscribed from this org. Never re-added — an import must not undo an opt-out. */
  suppressed: number;
  skipped: number;
  status: "mailable" | "pending";
};

/**
 * Write the contacts, being careful about three kinds of address that must not be overwritten:
 * people who already unsubscribed, people already in the list, and people who are genuine
 * pre-save fans. An import adds; it never resurrects or downgrades.
 */
export async function importContacts(opts: {
  organizationId: string;
  importedBy?: string | null;
  contacts: ParsedContact[];
  skipped: number;
  consentSource: string;
  consentKind: ConsentKind;
  consentAt: Date | null;
  consentNote: string;
}): Promise<ImportResult> {
  const importId = randomToken(12);
  // A marketing opt-in is a subscription and carries over. Anything else has to be confirmed first.
  const status = opts.consentKind === "marketing" ? "mailable" : "pending";
  const emails = opts.contacts.map((c) => c.email);
  const result: ImportResult = { importId, added: 0, duplicates: 0, alreadyFans: 0, suppressed: 0, skipped: opts.skipped, status };
  if (emails.length === 0) return result;

  for (let i = 0; i < emails.length; i += 1000) {
    const chunk = opts.contacts.slice(i, i + 1000);
    const chunkEmails = chunk.map((c) => c.email);

    const [existing, presaves] = await Promise.all([
      prisma.fanContact.findMany({ where: { organizationId: opts.organizationId, email: { in: chunkEmails } }, select: { email: true } }),
      prisma.preSave.findMany({
        where: { email: { in: chunkEmails }, release: { organizationId: opts.organizationId } },
        select: { email: true, status: true },
      }),
    ]);
    const have = new Set(existing.map((e) => e.email));
    // An unsubscribe anywhere in this org is a no. The fan said no to this label, not to one release.
    const unsubbed = new Set(presaves.filter((p) => p.status === "unsubscribed").map((p) => (p.email ?? "").toLowerCase()));
    const fans = new Set(presaves.map((p) => (p.email ?? "").toLowerCase()));

    const fresh = chunk.filter((c) => {
      if (unsubbed.has(c.email)) { result.suppressed++; return false; }
      if (have.has(c.email)) { result.duplicates++; return false; }
      if (fans.has(c.email)) { result.alreadyFans++; return false; }
      return true;
    });
    if (fresh.length === 0) continue;

    const created = await prisma.fanContact.createMany({
      data: fresh.map((c) => ({
        organizationId: opts.organizationId,
        email: c.email,
        name: c.name ?? null,
        country: c.country ?? null,
        consentSource: opts.consentSource,
        consentKind: opts.consentKind,
        consentAt: opts.consentAt,
        consentNote: opts.consentNote,
        status,
        importId,
        importedBy: opts.importedBy ?? null,
      })),
      skipDuplicates: true,
    });
    result.added += created.count;
  }
  return result;
}
