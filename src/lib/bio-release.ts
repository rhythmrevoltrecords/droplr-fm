/**
 * Which release a bio page shows, and what it says about it.
 *
 * The whole point of this block is that nobody maintains it. A link-in-bio page where the artist
 * types "OUT NOW" by hand is wrong the week after every release, and a page that is wrong is worse
 * than a page that says nothing. droplr already holds the release record, so the page reads it.
 *
 * Pure: no prisma, no clock of its own. `now` is a required argument everywhere for the same reason
 * it is in lib/blog.ts — a default would be evaluated once at module load and freeze the page at
 * build time, which is the bug that would make this block permanently wrong.
 */

export type BioReleaseRow = {
  id: string;
  slug: string;
  title: string;
  artistName: string;
  coverUrl: string;
  accentColor: string | null;
  releaseDate: Date;
  isPublic: boolean;
  /** "release" goes to stores; "download" is a gated pack and is not a release. */
  kind: string;
};

/**
 * out: released within the last fortnight, still the news.
 * latest: released longer ago — still theirs, but not an announcement.
 */
export type BioReleaseState = "upcoming" | "out" | "latest";

export type BioReleaseChoice = { release: BioReleaseRow; state: BioReleaseState };

/** How long after release day the page still says "Out now" rather than "Latest release". */
export const OUT_NOW_DAYS = 14;
const DAY = 86_400_000;

const eligible = (r: BioReleaseRow) => r.isPublic && r.kind === "release";

/**
 * The next release if one is coming, otherwise the most recent one.
 *
 * Chosen on `releaseDate` rather than the `status` column on purpose: status is flipped to "live"
 * by the release-day processor, so between the release instant and that run the column still says
 * "upcoming". The date is the fact; the column is a job's progress through it.
 *
 * `releaseDate` is the label's own moment. On a "local" rollout a fan in a later timezone can see
 * "Out now" a few hours before it unlocks for them — the release page itself resolves per-viewer
 * timing (lib/time isReleasedFor), and this block is a pointer at that page, not a substitute.
 */
export function pickBioRelease(rows: BioReleaseRow[], now: Date): BioReleaseChoice | null {
  const t = now.getTime();
  const ok = rows.filter(eligible);

  const upcoming = ok
    .filter((r) => r.releaseDate.getTime() > t)
    .sort((a, b) => a.releaseDate.getTime() - b.releaseDate.getTime())[0];
  if (upcoming) return { release: upcoming, state: "upcoming" };

  const past = ok
    .filter((r) => r.releaseDate.getTime() <= t)
    .sort((a, b) => b.releaseDate.getTime() - a.releaseDate.getTime())[0];
  if (!past) return null;

  return { release: past, state: t - past.releaseDate.getTime() <= OUT_NOW_DAYS * DAY ? "out" : "latest" };
}

/**
 * The small line above the title. Never a countdown: a page nobody reloads would count down wrong.
 *
 * Takes the state and the date rather than the whole choice, so the renderer can call it with what
 * it actually has. The first version took a BioReleaseChoice and the view had to cast a half-built
 * object to satisfy it, which is a signature problem wearing a cast.
 */
export function bioReleaseEyebrow(state: BioReleaseState, releaseDate: Date, tz: string | null | undefined): string {
  if (state === "out") return "Out now";
  if (state === "latest") return "Latest release";
  const date = new Intl.DateTimeFormat("en-AU", { timeZone: tz || "Australia/Brisbane", day: "numeric", month: "long" })
    .format(releaseDate);
  return `Out ${date}`;
}

/** What the button says. An upcoming release is a pre-save; a released one is a listen. */
export function bioReleaseAction(state: BioReleaseState): string {
  return state === "upcoming" ? "Pre-save" : "Listen";
}
