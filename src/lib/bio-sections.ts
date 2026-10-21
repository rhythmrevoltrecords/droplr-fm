/**
 * The order of the blocks on a bio page, and the one rule that matters:
 *
 *   A SECTION CAN NEVER VANISH BECAUSE OF WHAT IS STORED.
 *
 * The order is a stored string of keys. Everything that can go wrong with that goes wrong
 * quietly: a key removed from the code leaves a stale token in every row that has it; a key ADDED
 * to the code is in no stored row at all, so a brand-new block would be invisible to every
 * existing page until its owner happened to open the editor and save. Both are the same class of
 * bug as a link type dropping out of the picker, which is why PLATFORM_GROUPS has a catch-all.
 *
 * So `sectionOrder` is not read as the answer. It is read as a PREFERENCE and reconciled against
 * the code's own list: unknown tokens dropped, duplicates collapsed, and anything the code knows
 * about that the string does not mention appended in its default position. The output always
 * contains exactly the sections this version of droplr has, once each.
 */

/** Every orderable block, in the order a page uses when its owner has never said otherwise. */
// video and merch were added on 1 Nov 2026, between the email box and the back catalogue, so every
// page that already existed keeps exactly the order it had: neither block shows anything until
// its owner adds a row to it.
export const BIO_SECTIONS = ["release", "links", "subscribe", "video", "merch", "catalogue"] as const;
export type BioSection = (typeof BIO_SECTIONS)[number];

/**
 * The hero -- picture, name, bio line -- is deliberately not in that list. It is who the page is,
 * not a block on it, and a page whose name sits below a mailing-list form is not a page anyone
 * meant to build. The label badge is not in it either: it lives in the footer and is derived from
 * the label's roster, so it is not the artist's to move.
 */

export const SECTION_LABELS: Record<BioSection, string> = {
  release: "Latest release",
  links: "Your links",
  subscribe: "Email box",
  video: "Videos",
  merch: "Merch",
  catalogue: "More releases",
};

/** What each block is, in the editor, in one line. */
export const SECTION_HINTS: Record<BioSection, string> = {
  release: "The big card with your newest or next record.",
  links: "Your buttons.",
  subscribe: "Where fans leave their email address.",
  video: "Up to four YouTube videos that play on the page.",
  merch: "Pictures of what you sell, each one a link to your shop.",
  catalogue: "Everything else you have out, newest first.",
};

const isSection = (s: string): s is BioSection => (BIO_SECTIONS as readonly string[]).includes(s);

/**
 * Stored preference -> the real order.
 *
 * Null, empty, junk, half a list, a list with yesterday's key still in it: all of them come back
 * as every current section, once each, in the closest order to what was asked for.
 */
export function sectionOrder(stored: string | null | undefined): BioSection[] {
  const asked = (stored ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(isSection);

  const seen = new Set<BioSection>();
  const out: BioSection[] = [];
  for (const s of asked) {
    if (seen.has(s)) continue;   // a duplicate would render the same block twice
    seen.add(s);
    out.push(s);
  }
  // Anything this version of droplr has that the stored string never mentioned. Appended in the
  // default order so a new block shows up for every existing page without anyone re-saving.
  for (const s of BIO_SECTIONS) if (!seen.has(s)) out.push(s);
  return out;
}

/** What to store. Normalised through the same reconciliation, so a bad write cannot be saved. */
export function serialiseOrder(order: readonly string[]): string {
  return sectionOrder(order.join(",")).join(",");
}

/** True when the order is just the default — the case where storing nothing is tidier. */
export function isDefaultOrder(order: readonly string[]): boolean {
  return serialiseOrder(order) === BIO_SECTIONS.join(",");
}

/** Move one section up or down, for the editor's two buttons. Out-of-range moves are no-ops. */
export function moveSection(order: readonly BioSection[], index: number, delta: -1 | 1): BioSection[] {
  const next = [...order];
  const to = index + delta;
  if (index < 0 || index >= next.length || to < 0 || to >= next.length) return next;
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/**
 * What actually goes in the column.
 *
 * NULL for the default order, so a page that never touched the control is not pinned to this
 * version's section list and picks up anything added later. Anything else is normalised first,
 * which means a junk or stale value cannot be written even by a hand-made request.
 */
export function storedOrder(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const norm = serialiseOrder(raw.split(","));
  return isDefaultOrder(norm.split(",")) ? null : norm;
}
