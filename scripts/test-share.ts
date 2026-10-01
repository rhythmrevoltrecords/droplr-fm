/**
 * Share graphics: the cache key that decides whether an artist sees their own edit.
 *
 * What this defends. Each graphic is a server-side 1080x1920 rasterise and the tab asks for up to
 * eight at once, so they have to be cached. The first attempt cached them for five minutes from a
 * URL that never changed, which produced the bug as reported: *"you can't click re-render, it does
 * nothing — when one is done you have to leave that tab then back in to get it."* Change the accent
 * colour and the browser kept serving the old picture, and there was nothing in the UI that could
 * force a fresh one.
 *
 * The fix is a version key in the URL, so:
 *  - every field that changes the picture must change the key, or the artist sees a stale graphic
 *    with no way to clear it;
 *  - the label's own calendar day must change it, because the countdown graphic says "3 days to
 *    go" and yesterday's render is wrong today — in the LABEL's timezone, not the server's;
 *  - the same release on the same day must produce the SAME key, or caching buys nothing and every
 *    page view pays for eight rasterises again;
 *  - the plan must change it, because showBranding decides whether the droplr mark is on the image.
 *
 * No database, no browser, no rendering: shareVersion is a pure function by design.
 */
import { daysUntil, MILESTONES, SHARE_FORMATS, shareVersion } from "../src/lib/share-image";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

const BASE: Parameters<typeof shareVersion>[0] & { accentColor: string | null; now: Date } = {
  coverUrl: "https://cdn.example.com/art.jpg",
  logoUrl: "https://cdn.example.com/logo.png",
  accentColor: "#8b5cf6",
  orgAccentColor: "#111827",
  title: "California Dreaming",
  artistName: "Ototo",
  slug: "california-dreaming",
  labelName: "Rhythm Revolt Records",
  releaseDate: new Date("2026-10-16T13:00:00Z"),
  timezone: "Australia/Brisbane",
  showBranding: true,
  now: new Date("2026-10-01T02:00:00Z"),
};

function main() {
  const base = shareVersion(BASE);

  check("key is short enough for a URL", base.length === 16, `got ${base.length}`);
  check("key is URL-safe (base64url, no padding)", /^[\w-]{16}$/.test(base), base);
  check("same inputs, same key", shareVersion(BASE) === base);
  check("same inputs on a second call are not time-sensitive", shareVersion({ ...BASE, now: new Date("2026-10-01T09:00:00Z") }) === base);

  // Every field that reaches the image.
  // The logo is drawn into the image, so it has to be in the key — otherwise an artist uploads a
  // logo in Settings and their graphics keep arriving without it, cached, for a year.
  const variants: [string, Partial<typeof BASE>][] = [
    ["cover changed", { coverUrl: "https://cdn.example.com/art2.jpg" }],
    ["logo changed", { logoUrl: "https://cdn.example.com/logo2.png" }],
    ["logo removed", { logoUrl: null }],
    ["release accent changed", { accentColor: "#ff0066" }],
    ["release accent cleared (falls back to the org's)", { accentColor: null }],
    ["org accent changed", { orgAccentColor: "#00ffaa" }],
    ["title changed", { title: "California Dreaming (Instrumental)" }],
    ["artist changed", { artistName: "Nathan Hill" }],
    ["slug changed", { slug: "california-dreaming-instrumental" }],
    ["label name changed", { labelName: "Rhythm Revolt" }],
    ["release date changed", { releaseDate: new Date("2026-10-23T13:00:00Z") }],
    ["timezone changed", { timezone: "Europe/London" }],
    ["plan changed: mark removed", { showBranding: false }],
  ];
  for (const [name, patch] of variants) check(name, shareVersion({ ...BASE, ...patch }) !== base, "key did not change");

  // The countdown is a different picture tomorrow, so the key has to move with the label's day.
  const nextDay = shareVersion({ ...BASE, now: new Date("2026-10-02T02:00:00Z") });
  check("next calendar day changes the key", nextDay !== base);

  // ...and it must be the LABEL's day, not UTC's. 2026-10-01T15:00Z is still Oct 1 in UTC but
  // already Oct 2 in Brisbane (UTC+10), so a UTC-based key would wrongly serve yesterday's render.
  const brisbaneTomorrow = shareVersion({ ...BASE, now: new Date("2026-10-01T15:00:00Z") });
  check("rolls over on the label's calendar day, not UTC's", brisbaneTomorrow === nextDay, "used the server's day instead of the label's");

  // Two timezones, one instant: the graphic differs, so the key must.
  const sameInstantLondon = shareVersion({ ...BASE, timezone: "Europe/London", now: new Date("2026-10-01T15:00:00Z") });
  check("same instant in a different timezone is a different key", sameInstantLondon !== brisbaneTomorrow);

  // daysUntil is what the countdown badge prints; it counts whole calendar days in the label's tz.
  const tz = "Australia/Brisbane";
  // Brisbane is UTC+10, so the "now" instants below are chosen to sit mid-morning LOCAL time. Using
  // 22:00Z here instead reads as the next Brisbane day and the counts come out one short — which is
  // the same class of mistake the timezone checks above exist to catch.
  check("daysUntil: release day is 0", daysUntil(new Date("2026-10-16T13:00:00Z"), tz, new Date("2026-10-16T02:00:00Z")) === 0);
  check("daysUntil: day before is 1", daysUntil(new Date("2026-10-16T13:00:00Z"), tz, new Date("2026-10-15T02:00:00Z")) === 1);
  check("daysUntil: a past release is negative", daysUntil(new Date("2026-10-16T13:00:00Z"), tz, new Date("2026-10-18T02:00:00Z")) < 0);
  check("daysUntil: crosses on the label's midnight, not UTC's", daysUntil(new Date("2026-10-16T13:00:00Z"), tz, new Date("2026-10-15T15:00:00Z")) === 0, "15:00Z is already Oct 16 in Brisbane");

  // Both formats are portrait and 1080 wide — Instagram's story and 4:5 post.
  check("story is 1080x1920", SHARE_FORMATS.story.width === 1080 && SHARE_FORMATS.story.height === 1920);
  check("post is 1080x1350", SHARE_FORMATS.post.width === 1080 && SHARE_FORMATS.post.height === 1350);
  for (const [name, f] of Object.entries(SHARE_FORMATS)) check(`${name}: portrait, 1080 wide`, f.width === 1080 && f.height > f.width);

  // Milestones must be ascending and start where the UI says they unlock.
  check("milestones start at 25", MILESTONES[0] === 25);
  check("milestones strictly ascending", MILESTONES.every((n, i) => i === 0 || n > MILESTONES[i - 1]));

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main();
