import { AUTOMATIC, promoSteps, type PromoStep } from "./promo";

/**
 * The free release plan tool (droplr.fm/tools/release-plan).
 *
 * It is droplr's own promo plan, the one every release gets in the dashboard, laid out against a
 * date someone types in. Not a second copy of the advice: `promoSteps` is the only source, so the
 * public tool and the dashboard can never disagree, and fixing a step fixes both.
 *
 * Calendar dates, not instants. Someone planning a release thinks "Friday the 27th", not "Friday
 * the 27th in Australia/Brisbane", and the dates have to come out the same wherever the browser
 * is. So all arithmetic is on YYYY-MM-DD in UTC, where a day is always 24 hours.
 *
 * Pure: no prisma, no env. Imported by a client component.
 */

export type PlanKind = "artist" | "label";

/** The dashboard tab a step points at, by the name the dashboard shows it under. */
export const TAB_LABELS: Record<NonNullable<PromoStep["tab"]>, string> = {
  links: "Links",
  variants: "Variants & QR",
  analytics: "Analytics",
  presaves: "Pre-saves",
  share: "Share",
  settings: "Settings",
  clip: "Clip",
  contest: "Remix contest",
};

export { AUTOMATIC };

const DAY = 86_400_000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in YYYY-MM-DD, or null. "2026-02-30" is not a date. */
export function parseDay(s: string | null | undefined): Date | null {
  const m = ISO.exec(s ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toISOString().slice(0, 10) === s ? d : null;
}

export const dayString = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** The first Friday at least `minDays` after `today`. Stores release on Fridays. */
export function suggestedReleaseDay(today: Date, minDays = 28): Date {
  const start = addDays(today, minDays);
  return addDays(start, (5 - start.getUTCDay() + 7) % 7);
}

/** "4 weeks before", "Release day", "2 days after". What the step means without a date. */
export function relativeLabel(day: number): string {
  if (day === 0) return "Release day";
  const n = Math.abs(day);
  const when = day < 0 ? "before" : "after";
  if (n % 7 === 0) return `${n / 7} week${n === 7 ? "" : "s"} ${when}`;
  return `${n} day${n === 1 ? "" : "s"} ${when}`;
}

/**
 * Where a step stands on `today`:
 *  - upcoming: its day hasn't come;
 *  - late: its day has gone but doing it now still helps, so the tool says "do it now";
 *  - missed: it can't be done any more. Every pre-release step once release day has come, and
 *    the editorial pitch inside the last 7 days, because Spotify's editors won't take it then.
 */
export type StepStatus = "upcoming" | "late" | "missed";

/** Spotify's editors need a pitch at least this many days before release. */
export const PITCH_LEAD_DAYS = 7;

export type PlanItem = PromoStep & { date: string; past: boolean; status: StepStatus; relative: string };

/** The plan against a release day, so a release three weeks out shows what was missed. */
export function planFor(releaseDay: Date, kind: PlanKind, today: Date): PlanItem[] {
  const daysOut = Math.round((releaseDay.getTime() - today.getTime()) / DAY);
  return promoSteps(kind)
    .map((s) => {
      const d = addDays(releaseDay, s.day);
      const past = d.getTime() < today.getTime();
      const status: StepStatus = !past
        ? "upcoming"
        : (s.day < 0 && daysOut <= 0) || (s.key === "spotify-pitch" && daysOut < PITCH_LEAD_DAYS)
          ? "missed"
          : "late";
      return { ...s, date: dayString(d), past, status, relative: relativeLabel(s.day) };
    })
    .sort((a, b) => a.day - b.day);
}

/** Warnings about the date itself. Empty for a Friday at least four weeks out. */
export function dateNotes(releaseDay: Date, today: Date): string[] {
  const notes: string[] = [];
  if (releaseDay.getUTCDay() !== 5) notes.push("That isn't a Friday. Stores release new music on Fridays, so most releases go out on one.");
  const daysOut = Math.round((releaseDay.getTime() - today.getTime()) / DAY);
  if (daysOut < 0) notes.push("That day has already passed. The steps after release day still apply.");
  else if (daysOut < PITCH_LEAD_DAYS) notes.push(`Less than a week out: too late to pitch Spotify's editors, who need it at least ${PITCH_LEAD_DAYS} days before.`);
  else if (daysOut < 28) notes.push(`${daysOut} days out. The plan starts four weeks before, so do the steps marked late first.`);
  return notes;
}

// ---------------------------------------------------------------------------
// Calendar file
// ---------------------------------------------------------------------------

/** RFC 5545 TEXT escaping: backslash, semicolon, comma and newlines. */
function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets are folded: CRLF then one space. Never splits a UTF-8 character. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const compactDay = (iso: string) => iso.replace(/-/g, "");

/**
 * One all-day event per step. All-day on purpose: a step is "this day", and a timed event would
 * shift to the wrong day for anyone whose calendar is in another timezone.
 *
 * `id` is fresh per download. A UID built only from the date and step would be the same for two
 * releases on the same Friday, and a calendar treats a repeated UID as an update: importing the
 * second plan would quietly replace the first. Steps already missed are left out.
 */
export function planIcs(items: PlanItem[], o: { releaseTitle: string; stamp: Date; site: string; id: string }): string {
  const title = o.releaseTitle.trim() || "My release";
  const stamp = o.stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//droplr.fm//Release plan//EN", "CALSCALE:GREGORIAN"];
  for (const it of items.filter((i) => i.status !== "missed")) {
    const start = compactDay(it.date);
    const end = compactDay(dayString(addDays(parseDay(it.date)!, 1)));
    const where = it.tab ? `\n\nOn droplr: the ${TAB_LABELS[it.tab]} tab.` : "";
    lines.push(
      "BEGIN:VEVENT",
      fold(`UID:${start}-${it.key}-${o.id.replace(/[^\w-]/g, "")}@droplr.fm`),
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      fold(`SUMMARY:${icsText(`${title}: ${it.title}`)}`),
      fold(`DESCRIPTION:${icsText(`${it.body}${where}\n\nRelease plan from ${o.site}/tools/release-plan`)}`),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** The plan as plain text, for pasting into notes or a message. */
export function planText(items: PlanItem[], releaseTitle: string): string {
  const head = releaseTitle.trim() ? `Release plan: ${releaseTitle.trim()}` : "Release plan";
  return [head, "", ...items.map((it) => `${it.date}  ${it.title}\n            ${it.body}`)].join("\n");
}
