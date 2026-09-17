import { SITE_URL } from "@/lib/env";
import { LISTEN_CHOICES, platformMeta } from "@/lib/platforms";
import { formatInTz } from "@/lib/time";
import { Countdown } from "./countdown";
import { ArtworkHero, ArtworkPageShell, GlassLink, ShellFooter, type PublicTheme } from "./artwork-shell";
import { PlatformIcon } from "./platform-icon";
import { TimezoneField } from "./timezone-field";

export type ReleaseViewData = {
  id: string;
  title: string;
  artistName: string;
  coverUrl: string;
  accentColor: string | null;
  releaseDate: string; // ISO: when it unlocks for this visitor (their local midnight on a local rollout)
  spotifyArtistId?: string | null;
  links: { id: string; platform: string; label: string | null; url: string; buttonText?: string | null; icon?: string | null }[];
  org: { name: string; metaPixelId: string | null; tiktokPixelId: string | null; ga4Id: string | null; logoUrl: string | null; timezone?: string | null };
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
  theme?: PublicTheme;
};

const NOTICES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  email: { tone: "ok", text: "You're on the list. We'll email you on release day, in your own timezone." },
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

export function ReleaseView({ release, live, variantId, query, spotifyEnabled, deezerEnabled, showBranding, demo, theme = "dark" }: ReleaseViewProps) {
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
  // A plain link to the artist on Spotify works for every fan (Spotify only allows in-app saves/follows for 5 allowlisted
  // accounts per app). Following is what gets future releases in front of them inside Spotify.
  const followButton = release.spotifyArtistId && /^[A-Za-z0-9]{22}$/.test(release.spotifyArtistId) ? (
    <a href={r("spotifyFollow")} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-[#1ED760]/40 bg-[#1ED760]/10 p-2.5 pr-4 text-sm transition hover:bg-[#1ED760]/15">
      <PlatformIcon platform="spotify" />
      <span className="flex-1">
        <span className="block font-semibold">Follow {release.artistName} on Spotify</span>
        <span className="block text-xs text-white/60">New releases from artists you follow show up for you in Spotify</span>
      </span>
      <span className="text-xs font-semibold text-[#1ED760]">Follow ↗</span>
    </a>
  ) : null;

  return (
    <ArtworkPageShell
      theme={theme}
      imageUrl={release.coverUrl}
      accentColor={release.accentColor}
      footer={<ShellFooter showBranding={showBranding} orgName={release.org.name} />}
      pixels={demo ? null : { meta: release.org.metaPixelId, tiktok: release.org.tiktokPixelId, ga4: release.org.ga4Id, contentName: `${release.artistName} - ${release.title}` }}
    >
        <ArtworkHero
          imageUrl={release.coverUrl}
          accentColor={release.accentColor}
          alt={`${release.title} cover art`}
          eyebrow={live ? "Out now" : `Out ${formatInTz(new Date(release.releaseDate), release.org.timezone, { dateStyle: "medium" })}`}
          title={release.title}
          subtitle={release.artistName}
        />

        {notice && (
          <div role="status" className={`mt-5 rounded-xl px-4 py-3 text-sm ${notice.tone === "ok" ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30" : "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30"}`}>
            {notice.text}
          </div>
        )}

        {live ? (
          <ul className="mt-7 space-y-2.5">
            {release.links.map((l) => (
              <li key={l.id}>
                <GlassLink href={r(l.platform, { l: l.id })} platform={l.platform} label={l.label} action={l.buttonText} icon={l.icon} />
              </li>
            ))}
            {release.links.length === 0 && <li className="glass rounded-2xl p-4 text-center text-sm text-white/70">Links are landing shortly. Check back in a few minutes.</li>}
            {followButton && <li className="pt-2">{followButton}</li>}
          </ul>
        ) : (
          <div className="mt-7 space-y-5">
            <Countdown target={release.releaseDate} />

            <form method="post" action={demo ? undefined : "/api/presave/email"} className="glass space-y-3 rounded-2xl p-4">
              <input type="hidden" name="releaseId" value={release.id} />
              <TimezoneField />
              {variantId && <input type="hidden" name="variantId" value={variantId} />}
              {query.utm_source && <input type="hidden" name="utm_source" value={query.utm_source} />}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

              <label htmlFor="email" className="block text-sm font-semibold">Get it on release day</label>
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
              <fieldset className="space-y-2">
                <legend className="text-xs text-white/60">Where do you listen? <span className="text-white/40">(optional)</span></legend>
                <div className="flex flex-wrap gap-1.5">
                  {LISTEN_CHOICES.map((p) => (
                    <label key={p} className="cursor-pointer">
                      <input type="radio" name="listenOn" value={p} className="peer sr-only" />
                      <span className="inline-flex h-8 items-center rounded-full border border-white/15 bg-black/30 px-3 text-xs text-white/80 transition peer-checked:border-white peer-checked:bg-white peer-checked:text-black peer-focus-visible:ring-2 peer-focus-visible:ring-white/60">
                        {platformMeta(p).name}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-start gap-2.5 text-xs leading-relaxed text-white/70">
                <input type="checkbox" name="consent" value="yes" required className="mt-0.5 h-4 w-4 accent-white" />
                <span>Email me on release day. {release.org.name} can send me updates about this release. Unsubscribe anytime. <a href={`${SITE_URL}/legal/privacy`} target="_blank" rel="noreferrer" className="underline decoration-white/30 underline-offset-2 hover:text-white">Privacy</a></span>
              </label>
              <label className="flex items-start gap-2.5 text-xs leading-relaxed text-white/70">
                <input type="checkbox" name="news" value="yes" className="mt-0.5 h-4 w-4 accent-white" />
                <span>Also send me news and new music from {release.artistName}. <span className="text-white/45">Optional</span></span>
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
              {!release.links.some((l) => l.platform === "appleMusic") && <span className="text-xs text-white/50">Soon</span>}
            </a>

            {followButton}
          </div>
        )}

    </ArtworkPageShell>
  );
}
