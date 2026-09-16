import { Suspense } from "react";
import { DemoTrackFromSearch, DemoTrackView } from "./demo-view";

export const metadata = { title: "Demo release" };

/**
 * Static demo with fake data. No database, no tracking. ?view=presave shows the pre-save state.
 * The query string is read client-side (useSearchParams) so this page prerenders; the smart-link view is the static fallback.
 */
export default function DemoTrack() {
  return (
    <Suspense fallback={<DemoTrackView presave={false} />}>
      <DemoTrackFromSearch />
    </Suspense>
  );
}
