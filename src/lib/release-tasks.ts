import { zonedDay } from "./time";

/**
 * Release planning for teams: the pure half. No database import, so client components can use
 * the labels and limits; the queries and the reminder job are in release-tasks-server.ts.
 */

export const ASSIGNEES = ["label", "artist", "both"] as const;
export type Assignee = (typeof ASSIGNEES)[number];
export const isAssignee = (a: unknown): a is Assignee => typeof a === "string" && (ASSIGNEES as readonly string[]).includes(a);

export const TASK_LIMITS = { title: 120, note: 500, perRelease: 40, minDay: -365, maxDay: 365 };

export const ASSIGNEE_LABEL: Record<Assignee, string> = { label: "Label", artist: "Artist", both: "Both" };

/** Who a step or task reaches: the label's owners and admins, the release's artist login, or both. */
export const reaches = (a: Assignee) => ({ team: a !== "artist", artist: a !== "label" });

export type TaskInput = { title: string; note: string | null; day: number; assignee: Assignee };

/**
 * Validate a task from a request body. `partial` accepts any subset of the fields (an edit);
 * otherwise title and day are required. Returns the cleaned fields, or the first problem in words.
 */
export function parseTask(body: unknown, partial = false): { ok: Partial<TaskInput> } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const out: Partial<TaskInput> = {};
  if (b.title !== undefined || !partial) {
    if (typeof b.title !== "string" || !b.title.trim()) return { error: "Give the task a name." };
    const t = b.title.trim().replace(/\s+/g, " ");
    if (t.length > TASK_LIMITS.title) return { error: `Keep the name under ${TASK_LIMITS.title} characters.` };
    out.title = t;
  }
  if (b.note !== undefined) {
    if (b.note !== null && typeof b.note !== "string") return { error: "That note isn't text." };
    const n = typeof b.note === "string" ? b.note.trim() : "";
    if (n.length > TASK_LIMITS.note) return { error: `Keep the note under ${TASK_LIMITS.note} characters.` };
    out.note = n || null;
  }
  if (b.day !== undefined || !partial) {
    if (typeof b.day !== "number" || !Number.isInteger(b.day) || b.day < TASK_LIMITS.minDay || b.day > TASK_LIMITS.maxDay) {
      return { error: "Pick a day within a year either side of release day." };
    }
    out.day = b.day;
  }
  if (b.assignee !== undefined || !partial) {
    const a = b.assignee ?? "label";
    if (!isAssignee(a)) return { error: "Assign it to the label, the artist or both." };
    out.assignee = a;
  }
  return { ok: out };
}

/** "3 days before", "Release day", "2 weeks after" — the same words the promo plan uses. */
export const dayWords = (day: number) => (day === 0 ? "Release day" : day < 0 ? `${-day} day${day === -1 ? "" : "s"} before` : `${day} day${day === 1 ? "" : "s"} after`);

/** Same artist, closer than this many days apart, is flagged. Same day across the roster always is. */
export const CLASH_ARTIST_DAYS = 14;

export type ClashRelease = { id: string; title: string; artistName: string; artistProfileId: string | null; releaseDate: Date; kind: string };
export type Clash = { otherId: string; otherTitle: string; otherArtist: string; reason: "same-day" | "same-artist"; days: number };

const nameKey = (r: ClashRelease) => r.artistName.trim().toLowerCase().replace(/\s+/g, " ");
/** Same roster profile, or the same name: one release linked to a profile and another typed by hand are still one artist. */
const sameArtist = (a: ClashRelease, b: ClashRelease) => (!!a.artistProfileId && a.artistProfileId === b.artistProfileId) || (!!nameKey(a) && nameKey(a) === nameKey(b));
const dayNumber = (d: Date, tz: string) => Math.round(Date.parse(`${zonedDay(d, tz)}T00:00:00Z`) / 86_400_000);

/**
 * Releases that collide, keyed by release id. Two records out on the same day (in the account's
 * timezone) compete for the same fans, playlists and inbox. The same artist twice inside
 * CLASH_ARTIST_DAYS splits their own audience. Download gates are left out: they have no release day.
 *
 * A warning, never a block: a label can mean to put two out at once.
 */
export function findClashes(releases: ClashRelease[], tz: string): Map<string, Clash[]> {
  const rs = releases.filter((r) => r.kind !== "download").map((r) => ({ r, day: dayNumber(r.releaseDate, tz) }));
  rs.sort((a, b) => a.day - b.day);
  const out = new Map<string, Clash[]>();
  const add = (a: (typeof rs)[number], b: (typeof rs)[number], reason: Clash["reason"]) => {
    const list = out.get(a.r.id) ?? [];
    list.push({ otherId: b.r.id, otherTitle: b.r.title, otherArtist: b.r.artistName, reason, days: Math.abs(b.day - a.day) });
    out.set(a.r.id, list);
  };
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length && rs[j].day - rs[i].day < CLASH_ARTIST_DAYS; j++) {
      const a = rs[i], b = rs[j];
      const reason = a.day === b.day ? "same-day" : sameArtist(a.r, b.r) ? "same-artist" : null;
      if (!reason) continue;
      add(a, b, reason);
      add(b, a, reason);
    }
  }
  return out;
}

export function clashSentence(c: Clash) {
  if (c.reason === "same-day") return `${c.otherTitle} (${c.otherArtist}) comes out the same day.`;
  return `${c.otherTitle}, also by ${c.otherArtist}, is ${c.days} day${c.days === 1 ? "" : "s"} away.`;
}
