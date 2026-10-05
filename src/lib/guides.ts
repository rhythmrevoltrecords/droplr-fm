import { z } from "zod";

/**
 * The "Watch the guide" videos, and the only place their IDs, titles and release times live.
 *
 * These are hosted on YouTube and scheduled to go public there, one a week, at 9am Brisbane.
 * Before a video's moment the embed renders "Video unavailable", so a card shown early is worse
 * than no card — hence `publishAt` and `liveGuides()`, which every surface goes through.
 *
 * **If a video's YouTube schedule moves, change its `publishAt` here and nothing else.**
 *
 * Brisbane is UTC+10 with no daylight saving, so the offsets below are correct year-round and
 * need no timezone library; `Date` parses the offset and the comparison happens in UTC.
 */
export type GuideKey =
  | "walkthrough"
  | "checklist"
  | "superfans"
  | "bio-link"
  | "tracking"
  | "after-release";

export type Guide = {
  key: GuideKey;
  title: string;
  /** What the card says under the title. One line; it is a label, not a description. */
  blurb: string;
  /**
   * "2:45". Optional on purpose: a card with no runtime says "Watch" instead of "Watch (3 min)",
   * which is better than printing a number nobody checked. Fill it in when the video is up.
   */
  runtime?: string;
  /** The 11-character YouTube ID. An empty string means "not ready" and hides the card forever. */
  youTubeId: string;
  /** ISO 8601 with offset. The card stays hidden until this instant. */
  publishAt: string;
};

export const GUIDES: Guide[] = [
  {
    key: "walkthrough",
    title: "The full droplr walkthrough",
    blurb: "Every tab, in order, from a blank account to release day.",
    // Runtime deliberately unset: nobody has read it off the video yet.
    youTubeId: "pgSIW6lZ0Lo",
    publishAt: "2026-10-06T09:00:00+10:00",
  },
  {
    key: "checklist",
    title: "The Release Day Checklist",
    blurb: "What to have done before the day, and what to do on it.",
    runtime: "2:45",
    youTubeId: "IQ1gVKJeS8M",
    publishAt: "2026-10-13T09:00:00+10:00",
  },
  {
    key: "superfans",
    title: "Casual Listeners to Superfans",
    blurb: "Turning a pre-save into someone who opens your emails.",
    runtime: "2:30",
    youTubeId: "NVu8gt_8TDk",
    publishAt: "2026-10-20T09:00:00+10:00",
  },
  {
    key: "bio-link",
    title: "5 Link-in-Bio Mistakes",
    blurb: "The ones that quietly cost you listeners.",
    runtime: "2:03",
    youTubeId: "vjc7MCb-ID4",
    publishAt: "2026-10-27T09:00:00+10:00",
  },
  {
    key: "tracking",
    title: "Which Post Actually Brought Your Fans?",
    blurb: "Reading the numbers so the next post is a decision, not a guess.",
    runtime: "2:00",
    youTubeId: "Q_YQBMDVIgg",
    publishAt: "2026-11-03T09:00:00+10:00",
  },
  {
    key: "after-release",
    title: "After Release Day: Week 1 to Month 2",
    blurb: "The two months most releases are abandoned in.",
    runtime: "2:38",
    youTubeId: "oy-grNOabSc",
    publishAt: "2026-11-10T09:00:00+10:00",
  },
];

/** A YouTube ID is exactly 11 characters of [A-Za-z0-9_-]. Same shape `lib/contest.ts` validates. */
const ID_SHAPE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Every guide whose moment has passed and whose ID is usable, in config order.
 *
 * `now` is required rather than defaulted to `new Date()` so a caller cannot accidentally read the
 * clock at module load — which on a statically rendered page would freeze the answer at build time
 * and leave a card hidden until the next deploy. Pass a fresh `new Date()` per request.
 */
export function liveGuides(now: Date): Guide[] {
  return GUIDES.filter((g) => ID_SHAPE.test(g.youTubeId) && now.getTime() >= Date.parse(g.publishAt));
}

/** One guide by key, or null if it isn't live yet. */
export function liveGuide(key: GuideKey, now: Date): Guide | null {
  return liveGuides(now).find((g) => g.key === key) ?? null;
}

/** The thumbnail. YouTube serves this from its image CDN; see `GUIDE_THUMB_HOST` in the docs. */
export function guideThumb(g: Guide): string {
  return `https://i.ytimg.com/vi/${g.youTubeId}/hqdefault.jpg`;
}

/** The player, only ever loaded after a click. `cc_load_policy` because the videos are subtitled. */
export function guideEmbed(g: Guide): string {
  return `https://www.youtube-nocookie.com/embed/${g.youTubeId}?autoplay=1&rel=0&modestbranding=1&cc_load_policy=1`;
}

/** The "Open on YouTube" escape hatch, for anyone who would rather watch it there. */
export function guideWatchUrl(g: Guide): string {
  return `https://youtu.be/${g.youTubeId}`;
}

/** What a dismissal POST may contain. Unknown keys are rejected rather than stored. */
export const dismissSchema = z.object({ key: z.enum(GUIDES.map((g) => g.key) as [GuideKey, ...GuideKey[]]) });
