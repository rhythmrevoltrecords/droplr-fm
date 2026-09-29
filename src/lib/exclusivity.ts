/**
 * Beatport exclusivity, and whether the links this release is about to publish break it.
 *
 * Why this exists, and why nothing else can do it: droplr is the only thing that holds both the
 * exclusivity window *and* the list of links about to go live on the release page. Beatport knows
 * the window. The distributor knows the window. Neither knows that a Bandcamp button is scheduled
 * on the same record.
 *
 * Why it is genuinely hard: the three distributors a small electronic label actually uses publish
 * three different answers about what breaks a Beatport exclusive, and one adds a notice period.
 *
 *  - Beatport's own rule: windows of 2, 4 or 8 weeks or lifetime, set through the distributor at
 *    delivery, broken by any other *download* store — it names Amazon, Bandcamp, iTunes, Juno,
 *    Qobuz, SoundCloud Pro, Traxsource, Volumo and your own website — while "Streaming platforms
 *    are ok."
 *  - LabelWorx is stricter: the same list plus DJ-controller streaming (it names Apple Music, TIDAL
 *    and SoundCloud), plus "All edits (extended versions and radio edits)", plus pre-orders on
 *    other retailers.
 *  - Symphonic is looser: 2, 4, 6 or 8 weeks, and radio edits may still go to streaming during the
 *    window.
 *  - LabelGrid adds that Beatport requires at least 7 business days' notice before a window starts.
 *
 * droplr does not adjudicate between them. It asks which distributor's rulebook applies and then
 * answers under that one, citing it — because being told "your distributor says this breaks it" is
 * actionable, and being told "it depends" is not.
 *
 * Deliberately pure: no database, no fetch, no clock of its own. `now` is always passed in.
 */
import { platformMeta } from "./platforms";

/** Whose published rules to answer under. "unknown" until the label says. */
export type Rulebook = "beatport" | "labelworx" | "symphonic" | "unknown";

export const RULEBOOKS: { key: Rulebook; label: string; note: string }[] = [
  {
    key: "beatport",
    label: "Beatport's own rules",
    note: "Any other download store breaks it — Bandcamp, iTunes, Juno, Qobuz, Traxsource, your own site. Streaming is fine.",
  },
  {
    key: "labelworx",
    label: "LabelWorx",
    note: "Stricter: also counts DJ-controller streaming (Apple Music, TIDAL, SoundCloud), all edits, and pre-orders elsewhere.",
  },
  {
    key: "symphonic",
    label: "Symphonic",
    note: "Allows 2, 4, 6 or 8 weeks, and lets radio edits go to streaming during the window.",
  },
  {
    key: "unknown",
    label: "I'm not sure",
    note: "droplr will warn on anything any of the three would call a breach, and say which one.",
  },
];

export const isRulebook = (v: string | null | undefined): v is Rulebook =>
  !!v && RULEBOOKS.some((r) => r.key === v);

/** Window lengths each rulebook publishes. Symphonic is the only one that lists 6. */
export const WEEKS_BY_RULEBOOK: Record<Rulebook, number[]> = {
  beatport: [2, 4, 8],
  labelworx: [2, 4, 8],
  symphonic: [2, 4, 6, 8],
  unknown: [2, 4, 6, 8],
};

export type Verdict = "breaks" | "allowed" | "unclear";

/**
 * Platforms every rulebook treats as a download store, so every rulebook says they break it.
 * `custom` is not here: a custom button might be merch, a video or a ticket link, and droplr is not
 * going to guess. It gets "unclear" instead, which is the honest answer.
 */
const DOWNLOAD_STORES = ["bandcamp", "itunes", "juno", "qobuz", "traxsource", "beatport"] as const;

/** Platforms only LabelWorx counts, because it reads DJ-controller streaming as a download surface. */
const LABELWORX_ALSO = ["appleMusic", "tidal", "soundcloud"] as const;

/**
 * How one link's platform is treated under one rulebook.
 *
 * `beatport` itself is never a breach of its own exclusive — it's the store the exclusive is *with*.
 */
export function verdictFor(platform: string, rulebook: Rulebook, exclusiveStore: string): Verdict {
  if (platform === exclusiveStore) return "allowed";
  if (platform === "custom") return "unclear";

  const isStore = (DOWNLOAD_STORES as readonly string[]).includes(platform);
  if (isStore) return "breaks";

  if ((LABELWORX_ALSO as readonly string[]).includes(platform)) {
    // Beatport's own wording names "SoundCloud Pro", and droplr cannot tell a Pro download link
    // from an ordinary stream link by looking at the URL. So it says so rather than guessing.
    if (rulebook === "labelworx") return "breaks";
    if (platform === "soundcloud") return "unclear";
    return "allowed";
  }
  return "allowed";
}

export type ExclusivityWindow = {
  /** Platform key the release is exclusive to. null means no exclusive is set. */
  store: string | null;
  /** When the window opens — the store's own live date, not the wide release date. */
  from: Date | null;
  /** 2 | 4 | 6 | 8. null with a store set means lifetime. */
  weeks: number | null;
  rulebook: Rulebook;
};

export type ExclusivityLink = { platform: string; url: string; visible: boolean };

export type Finding = {
  level: "error" | "warning" | "note";
  /** Platform key the finding is about, when it is about one. */
  platform: string | null;
  text: string;
};

/** End of the window, or null for lifetime (or for no exclusive at all). */
export function windowEnd(w: ExclusivityWindow): Date | null {
  if (!w.store || !w.from || w.weeks == null) return null;
  return new Date(w.from.getTime() + w.weeks * 7 * 86_400_000);
}

/** Whether the window covers `now`. Lifetime windows never end. */
export function windowActive(w: ExclusivityWindow, now: Date): boolean {
  if (!w.store || !w.from) return false;
  if (now < w.from) return true; // not started yet, but the links are already scheduled
  const end = windowEnd(w);
  return end === null || now < end;
}

/**
 * Business days between two dates, counting Mon–Fri and ignoring public holidays.
 *
 * Holidays are deliberately not modelled: a calendar droplr has to keep up to date by hand is a
 * liability, and being told "7 business days" when the real answer is 6 because of a bank holiday is
 * the wrong kind of wrong. The warning says "at least", which is how Beatport words it.
 */
export function businessDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let days = 0;
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const d = cursor.getUTCDay();
    if (d !== 0 && d !== 6) days += 1;
  }
  return days;
}

/** Beatport's stated minimum notice before a window can start, per LabelGrid. */
export const NOTICE_BUSINESS_DAYS = 7;

const dateText = (d: Date, timezone: string | null | undefined) =>
  new Intl.DateTimeFormat("en-AU", {
    day: "numeric", month: "short", year: "numeric",
    timeZone: timezone || "UTC",
  }).format(d);

/**
 * Everything droplr can honestly say about this release's exclusivity and its links.
 *
 * Ordered most severe first so a caller can render the list as-is. Returns an empty array when no
 * exclusive is set, which is the common case — a validator that always has something to say is one
 * people stop reading, the same rule the metadata panel follows.
 */
export function exclusivityFindings(
  w: ExclusivityWindow,
  links: ExclusivityLink[],
  now: Date,
  timezone?: string | null,
): Finding[] {
  if (!w.store) return [];

  const findings: Finding[] = [];
  const storeName = platformMeta(w.store).name;
  const end = windowEnd(w);
  const active = windowActive(w, now);
  const endText = end ? dateText(end, timezone) : null;
  const scope = endText ? `until ${endText}` : "for life";

  if (active) {
    for (const link of links) {
      if (!link.visible) continue;
      const v = verdictFor(link.platform, w.rulebook, w.store);
      if (v === "allowed") continue;
      const name = platformMeta(link.platform).name;
      if (v === "breaks") {
        const who =
          w.rulebook === "labelworx" ? "LabelWorx"
          : w.rulebook === "symphonic" ? "Symphonic"
          : w.rulebook === "beatport" ? "Beatport"
          : "all three of Beatport, LabelWorx and Symphonic";
        findings.push({
          level: "error",
          platform: link.platform,
          text: `${name} breaks your ${storeName} exclusive, which runs ${scope}. ${who} count it as a competing download. Hide this link until the window closes, or drop the exclusive.`,
        });
      } else {
        findings.push({
          level: "warning",
          platform: link.platform,
          text:
            link.platform === "custom"
              ? `droplr can't tell what this custom link points at. If it sells a download — your own site, a Bandcamp code page — it breaks your ${storeName} exclusive, which runs ${scope}.`
              : `${name} might break your ${storeName} exclusive, which runs ${scope}. Beatport's wording bars "SoundCloud Pro" and droplr can't tell a Pro download link from a plain stream link. If downloads are switched on there, hide this until the window closes.`,
        });
      }
    }
  }

  if (w.from && now < w.from) {
    const notice = businessDaysBetween(now, w.from);
    if (notice < NOTICE_BUSINESS_DAYS) {
      findings.push({
        level: "warning",
        platform: w.store,
        text: `Beatport asks for at least ${NOTICE_BUSINESS_DAYS} business days' notice before an exclusive starts and this one opens in ${notice}. Check your distributor has already delivered it.`,
      });
    }
  }

  if (w.weeks != null && !WEEKS_BY_RULEBOOK[w.rulebook].includes(w.weeks)) {
    findings.push({
      level: "warning",
      platform: w.store,
      text: `${w.weeks} weeks isn't a window ${w.rulebook === "unknown" ? "any of the three distributors publish" : RULEBOOKS.find((r) => r.key === w.rulebook)?.label} publishes. The published lengths are ${WEEKS_BY_RULEBOOK[w.rulebook].join(", ")} weeks${w.rulebook === "symphonic" ? "" : " or lifetime"}.`,
    });
  }

  if (w.rulebook === "unknown" && findings.length > 0) {
    findings.push({
      level: "note",
      platform: null,
      text: "Beatport, LabelWorx and Symphonic publish different rules about what breaks an exclusive — LabelWorx also counts Apple Music, TIDAL and SoundCloud, Symphonic lets radio edits stream. Set your distributor above and droplr will answer under theirs instead of all three.",
    });
  }

  if (w.rulebook === "labelworx" && active) {
    findings.push({
      level: "note",
      platform: null,
      text: "LabelWorx also counts extended and radio edits, and pre-orders on other retailers, as breaking the exclusive. droplr can't see either of those, so check them yourself.",
    });
  }

  const order = { error: 0, warning: 1, note: 2 } as const;
  return findings.sort((a, b) => order[a.level] - order[b.level]);
}

/** One line for the release header. null when there's nothing to say. */
export function exclusivitySummary(w: ExclusivityWindow, now: Date, timezone?: string | null): string | null {
  if (!w.store) return null;
  const name = platformMeta(w.store).name;
  const end = windowEnd(w);
  if (!w.from) return `${name} exclusive — no start date set yet.`;
  if (!end) return `${name} exclusive, for life.`;
  if (now >= end) return `${name} exclusive ended ${dateText(end, timezone)}.`;
  return `${name} exclusive until ${dateText(end, timezone)}.`;
}

/**
 * Build a window from a release row.
 *
 * Kept here rather than inline at the call site so the "no rulebook set means unknown" default lives
 * in one place. A null rulebook must never quietly become "beatport": Beatport's own rule is the
 * loosest of the three, so defaulting to it would bless links LabelWorx would call a breach.
 */
export function exclusivityWindowOf(r: {
  exclusiveStore: string | null;
  exclusiveFrom: Date | null;
  exclusiveWeeks: number | null;
  exclusiveRulebook: string | null;
}): ExclusivityWindow {
  return {
    store: r.exclusiveStore,
    from: r.exclusiveFrom,
    weeks: r.exclusiveWeeks,
    rulebook: isRulebook(r.exclusiveRulebook) ? r.exclusiveRulebook : "unknown",
  };
}
