/**
 * The label badge on a linked artist's own bio page.
 *
 * "Signed to X" is a factual claim about a business relationship published on a public page, so
 * none of it is free text. Every part is read from the roster row the label maintains, and the
 * badge disappears on its own when that row stops saying what the badge says.
 *
 * Pure: the wording and the rules. The database half is lib/bio-label-server.ts.
 */

export type LabelBadge = {
  /** The label's organisation name, exactly as the label has it. */
  name: string;
  logoUrl: string | null;
  /** Their page on droplr, when the label has one worth linking. */
  href: string | null;
  /** From Artist.signedAt: present means an actual signing date is on the row. */
  signed: boolean;
};

/**
 * What the badge says.
 *
 * Two wordings because there are two situations, and only one of them supports the word "signed".
 * A roster row can be active without a signing date — a handshake, a one-off, an artist a label
 * puts out records for. Saying "Signed to" there would be droplr inventing a contract. Saying
 * "Releases on" is true in both cases, so that is the fallback rather than silence.
 */
export function labelBadgeLine(badge: Pick<LabelBadge, "name" | "signed">): string {
  return `${badge.signed ? "Signed to" : "Releases on"} ${badge.name}`;
}

/**
 * Is this roster row currently allowed to produce a badge?
 *
 * Three conditions, and all three are the label's own data:
 *  - the label permits it (Artist.labelBadge),
 *  - the row is active — a prospect is someone they are still talking to and an alumni has left,
 *    and publishing "signed to" for either is a false statement on someone else's page,
 *  - the row is linked to the account whose page this is.
 *
 * The artist's own switch (BioPage.labelBadge) is checked separately, so that neither side can
 * publish the other's name on its own.
 */
export function rosterRowAllowsBadge(
  row: { labelBadge: boolean; status: string; linkedUserId: string | null },
  viewerUserId: string,
): boolean {
  return row.labelBadge && row.status === "active" && row.linkedUserId === viewerUserId;
}
