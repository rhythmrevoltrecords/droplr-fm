// Time helpers. Instants are stored in UTC; each label picks an IANA timezone (Organization.timezone)
// that drives how dates are shown and how datetime-local inputs are interpreted. DST-safe via Intl.
export const DEFAULT_TZ = "Australia/Brisbane";
/** @deprecated kept for older imports — use DEFAULT_TZ */
export const BRISBANE_TZ = DEFAULT_TZ;

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const tzOr = (tz: string | null | undefined) => (isValidTimeZone(tz) ? tz : DEFAULT_TZ);

/** Wall-clock parts of an instant in a timezone. */
function partsIn(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

/** Offset (ms) of tz from UTC at instant d. */
function offsetMs(d: Date, tz: string) {
  const p = partsIn(d, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(d.getTime() / 1000) * 1000;
}

/** "2026-10-03T00:00" wall clock in tz (from <input type=datetime-local>) → UTC instant. */
export function zonedLocalToDate(local: string, tz?: string | null) {
  const zone = tzOr(tz);
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) throw new Error("Invalid date");
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  // Two passes handle DST transitions
  let t = asUtc - offsetMs(new Date(asUtc), zone);
  t = asUtc - offsetMs(new Date(t), zone);
  return new Date(t);
}

/** UTC instant → "YYYY-MM-DDTHH:mm" wall clock in tz, for datetime-local inputs. */
export function dateToZonedLocal(d: Date, tz?: string | null) {
  const p = partsIn(d, tzOr(tz));
  const z = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${z(p.mo)}-${z(p.d)}T${z(p.h)}:${z(p.mi)}`;
}

/** "YYYY-MM-DD" calendar day of an instant in tz. */
export function zonedDay(d: Date, tz?: string | null) {
  return dateToZonedLocal(d, tz).slice(0, 10);
}

export function formatInTz(d: Date, tz?: string | null, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) {
  return new Intl.DateTimeFormat("en-AU", { timeZone: tzOr(tz), ...opts }).format(d);
}

// Back-compat wrappers (Brisbane)
export const brisbaneLocalToDate = (local: string) => zonedLocalToDate(local, DEFAULT_TZ);
export const dateToBrisbaneLocal = (d: Date) => dateToZonedLocal(d, DEFAULT_TZ);
export const formatBrisbane = (d: Date, opts?: Intl.DateTimeFormatOptions) => formatInTz(d, DEFAULT_TZ, opts);

/** Release instants are stored in UTC, so "live" is a plain instant comparison. */
export function isReleased(releaseDate: Date, now = new Date()) {
  return releaseDate.getTime() <= now.getTime();
}

/** Curated label locations (searchable in settings); any IANA zone is accepted. */
export const LOCATIONS: { label: string; tz: string; region: string }[] = [
  { label: "Brisbane", tz: "Australia/Brisbane", region: "Australia" },
  { label: "Gold Coast", tz: "Australia/Brisbane", region: "Australia" },
  { label: "Sydney", tz: "Australia/Sydney", region: "Australia" },
  { label: "Melbourne", tz: "Australia/Melbourne", region: "Australia" },
  { label: "Canberra", tz: "Australia/Sydney", region: "Australia" },
  { label: "Adelaide", tz: "Australia/Adelaide", region: "Australia" },
  { label: "Perth", tz: "Australia/Perth", region: "Australia" },
  { label: "Hobart", tz: "Australia/Hobart", region: "Australia" },
  { label: "Darwin", tz: "Australia/Darwin", region: "Australia" },
  { label: "Auckland", tz: "Pacific/Auckland", region: "New Zealand" },
  { label: "London", tz: "Europe/London", region: "UK" },
  { label: "Manchester", tz: "Europe/London", region: "UK" },
  { label: "Bristol", tz: "Europe/London", region: "UK" },
  { label: "Dublin", tz: "Europe/Dublin", region: "Ireland" },
  { label: "Amsterdam", tz: "Europe/Amsterdam", region: "Netherlands" },
  { label: "Berlin", tz: "Europe/Berlin", region: "Germany" },
  { label: "Paris", tz: "Europe/Paris", region: "France" },
  { label: "Ibiza", tz: "Europe/Madrid", region: "Spain" },
  { label: "Barcelona", tz: "Europe/Madrid", region: "Spain" },
  { label: "Lisbon", tz: "Europe/Lisbon", region: "Portugal" },
  { label: "Stockholm", tz: "Europe/Stockholm", region: "Sweden" },
  { label: "Johannesburg", tz: "Africa/Johannesburg", region: "South Africa" },
  { label: "Dubai", tz: "Asia/Dubai", region: "UAE" },
  { label: "Mumbai", tz: "Asia/Kolkata", region: "India" },
  { label: "Singapore", tz: "Asia/Singapore", region: "Singapore" },
  { label: "Tokyo", tz: "Asia/Tokyo", region: "Japan" },
  { label: "Seoul", tz: "Asia/Seoul", region: "South Korea" },
  { label: "New York", tz: "America/New_York", region: "USA" },
  { label: "Miami", tz: "America/New_York", region: "USA" },
  { label: "Chicago", tz: "America/Chicago", region: "USA" },
  { label: "Detroit", tz: "America/Detroit", region: "USA" },
  { label: "Denver", tz: "America/Denver", region: "USA" },
  { label: "Los Angeles", tz: "America/Los_Angeles", region: "USA" },
  { label: "Toronto", tz: "America/Toronto", region: "Canada" },
  { label: "Vancouver", tz: "America/Vancouver", region: "Canada" },
  { label: "Mexico City", tz: "America/Mexico_City", region: "Mexico" },
  { label: "São Paulo", tz: "America/Sao_Paulo", region: "Brazil" },
];
