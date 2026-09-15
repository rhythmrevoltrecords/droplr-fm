import Link from "next/link";
import { ReleaseView } from "@/components/public/release-view";

export const metadata = { title: "Demo release" };

/** Static demo with fake data. No database, no tracking. ?view=presave shows the pre-save state. */
export default function DemoTrack({ searchParams }: { searchParams: { view?: string; done?: string } }) {
  const presave = searchParams.view === "presave";
  const releaseDate = presave ? new Date(Date.now() + 5 * 86400_000 + 7 * 3600_000).toISOString() : new Date(Date.now() - 3 * 86400_000).toISOString();
  const links = ["spotify", "appleMusic", "beatport", "traxsource", "bandcamp", "youtubeMusic", "soundcloud", "juno", "amazonMusic", "tidal"].map((p, i) => ({ id: `demo-${i}`, platform: p, label: null, url: "#" }));
  return (
    <>
      <div className="fixed left-1/2 top-3 z-50 flex -translate-x-1/2 gap-1 whitespace-nowrap rounded-full border border-white/10 bg-black/70 p-1 text-xs backdrop-blur">
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
          coverUrl: "/api/cover-art?title=Two%20Step%20Theory&a=%237C3AED&b=%23EC4899",
          accentColor: "#A855F7",
          releaseDate,
          links,
          org: { name: "Demo Label", metaPixelId: null, tiktokPixelId: null, ga4Id: null, logoUrl: null },
        }}
        query={{ done: searchParams.done }}
        spotifyEnabled
        deezerEnabled={false}
        showBranding
      />
    </>
  );
}
