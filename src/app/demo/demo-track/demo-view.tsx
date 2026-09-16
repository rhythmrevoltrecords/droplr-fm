"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ReleaseView } from "@/components/public/release-view";

const LINKS = ["spotify", "appleMusic", "beatport", "traxsource", "bandcamp", "youtubeMusic", "soundcloud", "juno", "amazonMusic", "tidal"].map((p, i) => ({ id: `demo-${i}`, platform: p, label: null, url: "#" }));

/** Fake release. Dates are relative to "now", so this only reads the clock in the browser (the page itself is static). */
export function DemoTrackView({ presave, done }: { presave: boolean; done?: string }) {
  const releaseDate = useMemo(
    () => (presave ? new Date(Date.now() + 5 * 86400_000 + 7 * 3600_000) : new Date(Date.now() - 3 * 86400_000)).toISOString(),
    [presave],
  );
  return (
    <>
      <div className="fixed left-1/2 top-3 z-50 flex -translate-x-1/2 gap-1 whitespace-nowrap rounded-full border border-white/10 bg-black/80 p-1 text-xs">
        <Link href="/demo/demo-track" className={`rounded-full px-3 py-1.5 ${!presave ? "bg-white text-black" : "text-white/70"}`}>Smart link</Link>
        <Link href="/demo/demo-track?view=presave" className={`rounded-full px-3 py-1.5 ${presave ? "bg-white text-black" : "text-white/70"}`}>Pre-save</Link>
        <Link href="/" className="rounded-full px-3 py-1.5 text-white/70">droplr.fm</Link>
      </div>
      <ReleaseView
        demo
        live={!presave}
        release={{
          id: "demo",
          title: "Two Step Theory",
          artistName: "Demo Artist",
          coverUrl: "/demo/two-step-theory.svg",
          accentColor: "#A855F7",
          releaseDate,
          links: LINKS,
          org: { name: "Demo Label", metaPixelId: null, tiktokPixelId: null, ga4Id: null, logoUrl: null },
        }}
        query={{ done }}
        spotifyEnabled
        deezerEnabled={false}
        showBranding
      />
    </>
  );
}

/** ?view=presave shows the pre-save state; ?done=… shows a notice. Read on the client so the route stays static. */
export function DemoTrackFromSearch() {
  const sp = useSearchParams();
  return <DemoTrackView presave={sp.get("view") === "presave"} done={sp.get("done") ?? undefined} />;
}
