import { platformMeta } from "./platforms";

/**
 * Public labels for a release's visible links, in order.
 * A custom title always wins. When a platform appears more than once without a title
 * (e.g. three SoundCloud links on a mashup pack), the 2nd and later become "SoundCloud (2)", "SoundCloud (3)".
 * The first one keeps the plain name, so single-link releases render exactly as before.
 */
export function labelDuplicateLinks<T extends { platform: string; title: string | null }>(links: T[]): (T & { label: string | null })[] {
  const seen = new Map<string, number>();
  return links.map((l) => {
    const n = (seen.get(l.platform) ?? 0) + 1;
    seen.set(l.platform, n);
    if (l.title) return { ...l, label: l.title };
    if (l.platform === "custom" || n === 1) return { ...l, label: null };
    return { ...l, label: `${platformMeta(l.platform).name} (${n})` };
  });
}
