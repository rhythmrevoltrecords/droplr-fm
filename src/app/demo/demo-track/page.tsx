import { Suspense } from "react";
import { DemoTrackFromSearch, DemoTrackView } from "./demo-view";
import { NOINDEX } from "@/lib/seo";
import { soundcloudGateEnforcement } from "@/lib/env";

export const metadata = { ...NOINDEX, title: "Demo pages" };

/**
 * Static demo with fake data. No database, no tracking. ?view= picks the page (presave, bio, gate),
 * ?look= the look. The query string is read client-side (useSearchParams) so this page prerenders;
 * the smart-link view is the static fallback.
 *
 * The SoundCloud step on the demo gate says what a real gate says today: read from the same setting,
 * at build time, so the demo can't claim a step is "done for you" while live gates say "on trust".
 */
export default function DemoTrack() {
  const enforcement = soundcloudGateEnforcement();
  return (
    <Suspense fallback={<DemoTrackView view="link" look="midnight" enforcement={enforcement} />}>
      <DemoTrackFromSearch enforcement={enforcement} />
    </Suspense>
  );
}
