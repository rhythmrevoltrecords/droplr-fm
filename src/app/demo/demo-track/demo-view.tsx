"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { BioView, type BioViewData } from "@/components/public/bio-view";
import { GateView, type GateStepView } from "@/components/public/gate-view";
import { ReleaseView } from "@/components/public/release-view";
import type { SocialIcon } from "@/components/public/social-icons";
import { BIO_THEMES, bioThemeOf, type BioThemeId } from "@/lib/bio-themes";
import { sectionOrder } from "@/lib/bio-sections";
import type { Enforcement } from "@/lib/gate-steps";

/**
 * The public demo: every kind of page droplr makes, with made-up data, in each of the four looks.
 *
 * No database, no tracking, no real ids. Every page is rendered in its `demo` mode, so nothing links
 * out, counts a tap or submits anywhere. Dates are relative to "now", so they read the clock in the
 * browser only (the route itself is static).
 *
 * The artist is called "Demo Artist" and the bio says the page is made up. Social icons point
 * nowhere: a demo that linked to a real profile would read as that person's page.
 */

export const DEMO_VIEWS = ["link", "presave", "bio", "gate"] as const;
export type DemoViewId = (typeof DEMO_VIEWS)[number];
const VIEW_LABELS: Record<DemoViewId, string> = { link: "Smart link", presave: "Pre-save", bio: "Bio page", gate: "Download" };

export const demoViewOf = (v: string | null | undefined): DemoViewId => (DEMO_VIEWS.includes(v as DemoViewId) ? (v as DemoViewId) : "link");

/** The address of a view in a look. Midnight is the default look, so it never appears in the URL. */
export function demoHref(view: DemoViewId, look: BioThemeId): string {
  const qs = new URLSearchParams();
  if (view !== "link") qs.set("view", view);
  if (look !== "midnight") qs.set("look", look);
  const s = qs.toString();
  return s ? `/demo/demo-track?${s}` : "/demo/demo-track";
}

const ARTIST = "Demo Artist";
const TITLE = "Two Step Theory";
const COVER = "/demo/two-step-theory.svg";
const ACCENT = "#A855F7";
const ORG = { name: "Demo Label", metaPixelId: null, tiktokPixelId: null, ga4Id: null, logoUrl: null };

const LINKS = ["spotify", "appleMusic", "youtubeMusic", "amazonMusic", "tidal", "deezer", "soundcloud", "beatport", "bandcamp", "audiomack"].map((p, i) => ({ id: `demo-${i}`, platform: p, label: null, url: "#" }));

const SOCIALS: SocialIcon[] = [
  { key: "instagram", label: "Instagram", href: "#" },
  { key: "tiktok", label: "TikTok", href: "#" },
  { key: "soundcloud", label: "SoundCloud", href: "#" },
  { key: "youtube", label: "YouTube", href: "#" },
  { key: "spotify", label: "Spotify", href: "#" },
];

const GATE_STEPS: GateStepView[] = [
  { id: "demo-email", platform: "email", action: "email", target: null, required: true, done: false, available: true },
  { id: "demo-sc", platform: "soundcloud", action: "follow", target: "#", required: true, done: false, available: true },
  { id: "demo-ig", platform: "instagram", action: "follow", target: "#", required: false, done: false, available: true },
];

/** A look as the release and download pages take it. Midnight is droplr's default, so it is no look at all. */
const pageLook = (look: BioThemeId) => (look === "midnight" ? null : { theme: look });

function bioPage(look: BioThemeId, now: number): BioViewData {
  const day = 86_400_000;
  return {
    title: ARTIST,
    bio: "A demo page. The artist, the music and the merch are all made up.",
    imageUrl: "/demo/avatar.svg",
    accentColor: ACCENT,
    theme: look,
    font: look === "mono" ? "typewriter" : "clean",
    releases: [
      { state: "upcoming", title: TITLE, artistName: ARTIST, coverUrl: COVER, releaseDate: new Date(now + 5 * day), href: "#" },
      { state: "latest", title: "Sky Garage", artistName: ARTIST, coverUrl: "/demo/two-step-sky.svg", releaseDate: new Date(now - 60 * day), href: "#" },
    ],
    links: [
      { id: "demo-tix", platform: "custom", url: "#", label: "Tickets: Saturday show", buttonText: "Tickets", icon: "🎟" },
      { id: "demo-pack", platform: "custom", url: "#", label: "Free edit pack", buttonText: "Download", icon: "↓" },
      { id: "demo-sp", platform: "spotify", url: "#", label: null },
    ],
    videos: [
      { id: "demo-v1", name: `${TITLE} (visualiser)`, url: "https://www.youtube.com/watch?v=droplrdemo1", imageUrl: "/demo/video-still.svg", highlight: true },
      { id: "demo-v2", name: "Studio session", url: "https://www.youtube.com/watch?v=droplrdemo2", imageUrl: "/demo/video-still.svg", highlight: false },
    ],
    merch: [
      { id: "demo-m1", name: "Logo tee", url: "#", imageUrl: "/demo/merch-tee.svg", highlight: false },
      { id: "demo-m2", name: "Hoodie", url: "#", imageUrl: "/demo/merch-hoodie.svg", highlight: false },
      { id: "demo-m3", name: "12\" vinyl", url: "#", imageUrl: "/demo/merch-vinyl.svg", highlight: false },
      { id: "demo-m4", name: "Cap", url: "#", imageUrl: "/demo/merch-cap.svg", highlight: false },
    ],
    merchDisplay: { show: "page", layout: "carousel" },
    socials: SOCIALS,
    iconStyle: look === "poster" ? "solid" : look === "paper" ? "brand" : "plain",
  };
}

export function DemoTrackView({ view, look, done, enforcement }: { view: DemoViewId; look: BioThemeId; done?: string; enforcement: Enforcement }) {
  const now = useMemo(() => Date.now(), []);
  const releaseDate = useMemo(
    () => new Date(view === "presave" ? now + 5 * 86400_000 + 7 * 3600_000 : now - 3 * 86400_000).toISOString(),
    [view, now],
  );
  const light = look === "paper";
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 transition ${on ? "bg-white text-black" : "text-white/70 hover:text-white"}`;

  return (
    <>
      <nav aria-label="Demo pages" className="fixed left-1/2 top-3 z-50 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 overflow-x-auto rounded-full border border-white/10 bg-black/80 p-1 text-xs backdrop-blur [scrollbar-width:none]">
        <div className="flex w-max gap-1 whitespace-nowrap">
          {DEMO_VIEWS.map((v) => (
            <Link key={v} href={demoHref(v, look)} aria-current={v === view ? "page" : undefined} className={chip(v === view)}>{VIEW_LABELS[v]}</Link>
          ))}
        </div>
      </nav>

      {/* Room for the page switcher, so it never sits on the artwork. Same background as the page. */}
      <div aria-hidden className="h-14" style={{ background: light ? "#fafafa" : "#000" }} />

      {view === "bio" ? (
        <BioView
          demo
          page={bioPage(look, now)}
          orgName={ARTIST}
          showBranding
          pixels={null}
          subscribe={{ on: true, pageId: "demo", buttonText: null }}
          done={done}
          order={sectionOrder(null)}
        />
      ) : view === "gate" ? (
        <GateView
          demo
          enforcement={enforcement}
          release={{
            id: "demo",
            title: `${TITLE} (edit pack)`,
            artistName: ARTIST,
            coverUrl: COVER,
            accentColor: ACCENT,
            downloadNote: "Three edits and the acapella, as WAV.",
            org: ORG,
            look: pageLook(look),
            socials: SOCIALS,
          }}
          steps={GATE_STEPS}
          unlocked={false}
          query={{ done }}
          showBranding
        />
      ) : (
        <ReleaseView
          demo
          live={view === "link"}
          release={{
            socials: SOCIALS,
            id: "demo",
            title: TITLE,
            artistName: ARTIST,
            coverUrl: COVER,
            accentColor: ACCENT,
            releaseDate,
            links: LINKS,
            org: ORG,
            look: pageLook(look),
          }}
          query={{ done }}
          spotifyEnabled
          deezerEnabled={false}
          showBranding
        />
      )}

      {/* Room for the look picker, so it never covers the footer. The footer links back to droplr.fm. */}
      <div aria-hidden className="h-20" style={{ background: light ? "#fafafa" : "#000" }} />
      <nav aria-label="Page looks" className="fixed bottom-3 left-1/2 z-50 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 overflow-x-auto rounded-full border border-white/10 bg-black/80 p-1 text-xs backdrop-blur [scrollbar-width:none]">
        <div className="flex w-max items-center gap-1 whitespace-nowrap">
          <span className="px-2 text-white/45">Look</span>
          {BIO_THEMES.map((t) => (
            <Link key={t.id} href={demoHref(view, t.id)} aria-current={t.id === look ? "true" : undefined} className={chip(t.id === look)}>{t.name}</Link>
          ))}
        </div>
      </nav>
    </>
  );
}

/** ?view= picks the page, ?look= the look, ?done=… shows a notice. Read on the client so the route stays static. */
export function DemoTrackFromSearch({ enforcement }: { enforcement: Enforcement }) {
  const sp = useSearchParams();
  return <DemoTrackView view={demoViewOf(sp.get("view"))} look={bioThemeOf(sp.get("look"))} done={sp.get("done") ?? undefined} enforcement={enforcement} />;
}
