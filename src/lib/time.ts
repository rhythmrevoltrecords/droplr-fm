// Brisbane is UTC+10 all year (Queensland has no daylight saving).
export const BRISBANE_TZ = "Australia/Brisbane";
const OFFSET = "+10:00";

/** "2026-10-03T00:00" (Brisbane wall clock, from <input type=datetime-local>) → Date (UTC instant) */
export function brisbaneLocalToDate(local: string) {
  const v = local.length === 16 ? `${local}:00` : local;
  const d = new Date(`${v}${OFFSET}`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  return d;
}

/** Date → "2026-10-03T00:00" in Brisbane wall-clock, for datetime-local inputs */
export function dateToBrisbaneLocal(d: Date) {
  const shifted = new Date(d.getTime() + 10 * 3600 * 1000);
  return shifted.toISOString().slice(0, 16);
}

export function formatBrisbane(d: Date, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) {
  return new Intl.DateTimeFormat("en-AU", { timeZone: BRISBANE_TZ, ...opts }).format(d);
}

/** Release instants are stored in UTC, so "live" is a plain instant comparison. */
export function isReleased(releaseDate: Date, now = new Date()) {
  return releaseDate.getTime() <= now.getTime();
}
