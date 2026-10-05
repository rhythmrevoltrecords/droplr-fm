import { prisma } from "./db";

/** What the banner needs. Deliberately not the whole row — `createdBy` is our business, not theirs. */
export type VisibleMessage = {
  id: string;
  title: string | null;
  body: string;
  linkUrl: string | null;
  linkLabel: string | null;
  tone: string;
};

/** How many show at once. More than this on screen is a wall, not a notice. */
export const MAX_SHOWN = 3;

/** Tones the UI knows how to colour. Anything else is stored but rendered as "info". */
export const TONES = ["info", "good", "warn"] as const;
export type Tone = (typeof TONES)[number];
export const toneOf = (t: string): Tone => ((TONES as readonly string[]).includes(t) ? (t as Tone) : "info");

/**
 * The messages this login should see right now, newest first.
 *
 * **This is the only place a message is selected, and the only thing standing between one
 * account's private notice and another account's dashboard.** Every condition here matters:
 *
 *  - `organizationId: null` (everyone) OR exactly this user's org. Never a bare `organizationId`
 *    filter that could be undefined — an undefined there removes the clause and returns the lot.
 *  - `revokedAt: null` — pulled messages stay in the table for the record but stop showing.
 *  - the time window, so a notice can be written now and appear later.
 *  - `seen: { none: { userId } }` — dismissal is per login, not per organisation, because two
 *    people sharing a label account each need to read it.
 *
 * Takes the user's own ids as arguments rather than reading the session, so a test can call it
 * directly and so no caller can accidentally pass someone else's.
 */
export async function messagesFor(user: { id: string; organizationId: string }, now = new Date()): Promise<VisibleMessage[]> {
  const rows = await prisma.platformMessage.findMany({
    where: {
      revokedAt: null,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      AND: [{ OR: [{ organizationId: null }, { organizationId: user.organizationId }] }],
      seen: { none: { userId: user.id } },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_SHOWN,
    select: { id: true, title: true, body: true, linkUrl: true, linkLabel: true, tone: true },
  });
  return rows;
}

/**
 * Whether this login is allowed to dismiss that message — i.e. whether it was ever theirs to read.
 *
 * Dismissing something you can't see is harmless in itself, but checking means the seen table only
 * ever grows rows that mean something, and it keeps the dismiss route from being a way to find out
 * whether an id exists.
 */
export async function canDismiss(user: { organizationId: string }, messageId: string): Promise<boolean> {
  const m = await prisma.platformMessage.findFirst({
    where: { id: messageId, AND: [{ OR: [{ organizationId: null }, { organizationId: user.organizationId }] }] },
    select: { id: true },
  });
  return !!m;
}

/** Trim and bound what an admin typed. Returns null for a body that is only whitespace. */
export function cleanMessage(input: { title?: unknown; body?: unknown; linkUrl?: unknown; linkLabel?: unknown; tone?: unknown }) {
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const body = str(input.body, 2000);
  if (!body) return null;

  // Only http(s), and only an absolute URL. A relative one would resolve against the dashboard and
  // a javascript: one is the obvious thing to try — neither reaches the href.
  let linkUrl: string | null = null;
  const raw = str(input.linkUrl, 500);
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === "http:" || u.protocol === "https:") linkUrl = u.toString();
    } catch { linkUrl = null; }
  }

  return {
    title: str(input.title, 120) || null,
    body,
    linkUrl,
    linkLabel: linkUrl ? str(input.linkLabel, 60) || "Read more" : null,
    tone: toneOf(str(input.tone, 10)),
  };
}
