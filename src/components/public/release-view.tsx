import Image from "next/image";
import { platformMeta } from "@/lib/platforms";
import { formatBrisbane } from "@/lib/time";
import { Countdown } from "./countdown";
import { Pixels } from "./pixels";
import { PlatformIcon } from "./platform-icon";

export type ReleaseViewData = {
  id: string;
  title: string;
  artistName: string;
  coverUrl: string;
  accentColor: string | null;
  releaseDate: string; // ISO
  links: { id: string; platform: string; label: string | null; url: string }[];
  org: { name: string; metaPixelId: string | null; tiktokPixelId: string | null; ga4Id: string | null; logoUrl: string | null };
};

export type ReleaseViewProps = {
  release: ReleaseViewData;
  live: boolean;
  variantId?: string | null;
  query: Record<string, string | undefined>;
  spotifyEnabled: boolean;
  deezerEnabled: boolean;
  showBranding: boolean;
  demo?: boolean;
};

const NOTICES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  email: { tone: "ok", text: "You're on the list. We'll email you the second it drops." },
  spotify: { tone: "ok", text: "Pre-saved on Spotify. It'll be in your library on release day." },
  "spotify-saved": { tone: "ok", text: "Saved to your Spotify library." },
  deezer: { tone: "ok", text: "Pre-saved on Deezer." },
  "apple-soon": { tone: "warn", text: "Apple Music pre-add is coming soon. Drop your email and we'll send you the link on release day." },
  "spotify-unavailable": { tone: "warn", text: "Spotify pre-save isn't switched on for this release. Use email instead." },
  "spotify-denied": { tone: "warn", text: "Spotify connection was cancelled." },
  "spotify-not-allowed": { tone: "warn", text: "This label's Spotify app is in development mode and your account isn't allowlisted. Use email instead." },
  error: { tone: "warn", text: "Something went wrong. Please try again." },
  unsubscribed: { tone: "ok", text: "You've been unsubscribed." },
};

function buildHref(base: string, params: Record<string, string | undefined | null>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

export function ReleaseView({ release, live, variantId, query, spotifyEnabled, deezerEnabled, showBranding, demo }: ReleaseViewProps) {
  const accent = release.accentColor ?? "#8B5CF6";
  const passthrough = {
    variant: variantId ?? undefined,
    utm_source: query.utm_source,
    utm_medium: query.utm_medium,
    utm_campaign: query.utm_campaign,
    pst: query.pst,
  };
  const notice = NOTICES[query.done ?? query.notice ?? ""];
  const r = (platform: string, extra: Record<string, string | undefined> = {}) =>
    demo ? "#" : buildHref(`/api/r/${release.id}/${platform}`, { ...passthrough, ...extra });

  return (
    <main className="relative min-h-dvh overflow-hidden bg-black text-white">
      {/* Artwork-driven background */}
      <div aria-hidden className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={release.coverUrl} alt="" className="h-full w-full scale-125 object-cover opacity-50 blur-3xl saturate-150" />
        <div className="absolute inset-0" style={{ background: `radial-gradient(120% 70% at 50% 0%, ${accent}66 0%, transparent 60%), linear-gradient(180deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,.85) 55%, #000 100%)` }} />
      </div>
      <div className="grain absolute inset-0" aria-hidden />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="mx-auto w-full max-w-[320px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={release.coverUrl}
            alt={`${release.title} cover art`}
            className="aspect-square w-full rounded-2xl object-cover shadow-2xl ring-1 ring-white/10"
            style={{ boxShadow: `0 30px 80px -20px ${accent}99` }}
          />
        </div>

        <div className="mt-6 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/60">
            {live ? "Out now" : `Out ${formatBrisbane(new Date(release.releaseDate), { dateStyle: "medium" })}`}
          </p>
          <h1 className="mt-2 text-balance text-3xl font-bold tracking-tight">{release.title}</h1>
          <p className="mt-1 text-lg text-white/75">{release.artistName}</p>
        </div>

        {notice && (
          <div role="status" className={`mt-5 rounded-xl px-4 py-3 text-sm ${notice.tone === "ok" ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30" : "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30"}`}>
            {notice.text}
          </div>
        )}

        {live ? (
          <ul className="mt-7 space-y-2.5">
            {release.links.map((l) => {
              const m = platformMeta(l.platform);
              return (
                <li key={l.id}>
                  <a
                    href={r(l.platform, l.platform === "custom" ? { l: l.id } : {})}
                    data-track={l.platform}
                    className="glass group flex items-center gap-3 rounded-2xl p-2.5 pr-3 transition hover:bg-white/[0.12] active:scale-[0.99]"
                  >
                    <PlatformIcon platform={l.platform} />
                    <span className="flex-1 truncate font-medium">{l.label || m.name}</span>
                    <span className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black transition group-hover:bg-white/90">{m.action}</span>
                  </a>
                </li>
              );
            })}
            {release.links.length === 0 && <li className="glass rounded-2xl p-4 text-center text-sm text-white/70">Links are landing shortly. Check back in a few minutes.</li>}
          </ul>
        ) : (
          <div className="mt-7 space-y-5">
            <Countdown target={release.releaseDate} />

            <form method="post" action={demo ? undefined : "/api/presave/email"} className="glass space-y-3 rounded-2xl p-4">
              <input type="hidden" name="releaseId" value={release.id} />
              {variantId && <input type="hidden" name="variantId" value={variantId} />}
              {query.utm_source && <input type="hidden" name="utm_source" value={query.utm_source} />}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

              <label htmlFor="email" className="block text-sm font-semibold">Get it the second it drops</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="you@email.com"
                className="h-12 w-full rounded-xl border border-white/15 bg-black/40 px-4 text-base placeholder:text-white/40 focus:outline-none focus:ring-2"
                style={{ ["--tw-ring-color" as string]: accent }}
              />
              <label className="flex items-start gap-2.5 text-xs leading-relaxed text-white/70">
                <input type="checkbox" name="consent" value="yes" required className="mt-0.5 h-4 w-4 accent-white" />
                <span>Email me on release day. {release.org.name} can send me updates about this release. Unsubscribe anytime.</span>
              </label>
              <button type="submit" data-track="email" data-kind="presave" className="h-12 w-full rounded-xl font-semibold text-black transition active:scale-[0.99]" style={{ backgroundColor: "#fff" }}>
                Pre-save with email
              </button>

              {(spotifyEnabled || deezerEnabled) && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-white/40">
                    <span className="h-px flex-1 bg-white/10" />or save automatically<span className="h-px flex-1 bg-white/10" />
                  </div>
                  {spotifyEnabled && (
                    <button
                      formAction={r("spotify", { mode: "presave" })}
                      formNoValidate
                      data-track="spotify"
                      data-kind="presave"
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1ED760] font-semibold text-black transition hover:brightness-105"
                    >
                      Pre-save on Spotify
                    </button>
                  )}
                  {deezerEnabled && (
                    <button formAction={r("deezer", { mode: "presave" })} formNoValidate data-track="deezer" data-kind="presave" className="flex h-12 w-full items-center justify-center rounded-xl bg-[#A238FF] font-semibold text-white">
                      Pre-save on Deezer
                    </button>
                  )}
                </div>
              )}
            </form>

            <a href={r("appleMusic", { mode: "presave" })} data-track="appleMusic" data-kind="presave" className="glass flex items-center gap-3 rounded-2xl p-2.5 pr-3 text-sm">
              <PlatformIcon platform="appleMusic" />
              <span className="flex-1">Pre-add on Apple Music</span>
              <span className="text-xs text-white/50">Soon</span>
            </a>
          </div>
        )}

        <div className="mt-auto pt-10 text-center text-xs text-white/40">
          {showBranding ? (
            <a href="https://droplr.fm" className="inline-flex items-center gap-1.5 hover:text-white/70">
              <Image src="/logo/icon.png" alt="" width={16} height={16} className="h-4 w-4 opacity-60 brightness-0 invert" />
              Powered by droplr.fm
            </a>
          ) : (
            <span>{release.org.name}</span>
          )}
        </div>
      </div>

      {!demo && <Pixels meta={release.org.metaPixelId} tiktok={release.org.tiktokPixelId} ga4={release.org.ga4Id} contentName={`${release.artistName} - ${release.title}`} />}
    </main>
  );
}
