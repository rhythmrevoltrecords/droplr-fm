import { Fragment } from "react";
import { labelBadgeLine, type LabelBadge } from "@/lib/bio-label";
import { isMailto } from "@/lib/platforms";
import { bioReleaseAction, bioReleaseEyebrow, type BioReleaseState } from "@/lib/bio-release";
import { bioFontOf, bioSkinClass, bioThemeHasGlow, bioThemeIsLight, bioThemeOf } from "@/lib/bio-themes";
import { subscribeButtonText, subscribeConsentLine, subscribeHeading } from "@/lib/bio-subscribe";
import type { BioSection } from "@/lib/bio-sections";
import type { BioItem, MerchDisplay } from "@/lib/bio-items";
import { SITE_URL } from "@/lib/env";
import { ArtworkHero, ArtworkPageShell, GlassLink, ShellFooter, type PublicTheme, type ShellPixels } from "./artwork-shell";
import { bioFontClass } from "./bio-fonts";
import { BioVideo } from "./bio-video";
import { SocialIcons, type SocialIcon } from "./social-icons";

export type BioRelease = {
  state: BioReleaseState;
  title: string;
  artistName: string;
  coverUrl: string;
  releaseDate: Date;
  href: string;
};

export type BioViewData = {
  title: string;
  bio: string | null;
  imageUrl: string;
  accentColor: string | null;
  /** One of BIO_THEMES; anything else (or null) falls back to the default look. */
  theme?: string | null;
  /** One of BIO_FONTS; same fallback. */
  font?: string | null;
  /**
   * The releases to show, already ordered by lib/bio-release: upcoming soonest-first, then
   * released newest-first. The first is the hero above the links; the rest go underneath.
   */
  releases?: BioRelease[];
  /** Whole-page background chosen by the owner. The image wins when both are set. */
  background?: { url?: string | null; color?: string | null } | null;
  /** Link button colour; what it does depends on the theme. */
  buttonColor?: string | null;
  links: { id: string; platform: string; url?: string | null; label: string | null; buttonText?: string | null; icon?: string | null; iconUrl?: string | null }[];
  /**
   * The merch and video blocks, already filtered to visible rows by lib/bio-items visibleItems.
   * Required, not optional, for the reason BioSubscribe gives below: the editor's preview leaving
   * one out would show an empty block the live page fills, and nothing would say so.
   */
  merch: BioItem[];
  videos: BioItem[];
  /** How the merch block sits: behind one button or on the page, tiles or a swipeable row. */
  merchDisplay: MerchDisplay;
  /**
   * The icon row under the name, already resolved (lib/bio-socials). Empty when the row is off or
   * the profile has none. Required like the others: a preview that forgot it would show no row.
   */
  socials: SocialIcon[];
};

/** The merch items, as tiles two to a row or as one row you swipe. Server-rendered, no JS. */
function MerchItems({ items, layout, preview }: { items: BioItem[]; layout: MerchDisplay["layout"]; preview: boolean }) {
  const card = (m: BioItem) => (
    <a href={preview ? undefined : `/api/b/${m.id}`} className="glass block overflow-hidden rounded-xl transition hover:scale-[1.01]">
      {m.imageUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={m.imageUrl} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
      )}
      <span className="block truncate px-2.5 py-2 text-[13px] font-medium">{m.name}</span>
    </a>
  );
  if (layout === "carousel") {
    return (
      // Scroll-snap, not a slider library: swipes natively on a phone, nothing to download.
      // Cards are narrower than the row so the next one peeks in and says "there's more".
      <ul className="-mx-1 mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
        {items.map((m) => <li key={m.id} className="w-[44%] shrink-0 snap-start">{card(m)}</li>)}
      </ul>
    );
  }
  return (
    <ul className="mt-3 grid grid-cols-2 gap-2.5">
      {items.map((m) => <li key={m.id}>{card(m)}</li>)}
    </ul>
  );
}

/** Bio link page: same artwork shell + glass links as release pages, with a circular avatar. */
/**
 * Whether this page asks for email addresses, and what its button says.
 *
 * NOT optional, and not defaulted. An optional prop is how a value silently fails to arrive: the
 * glow shipped three times with a default standing in for a value its caller never passed, and
 * `tsc` had nothing to say on any of them. A page that is supposed to collect addresses and
 * quietly doesn't is the same bug with a worse consequence, so every caller has to answer.
 */
export type BioSubscribe = { on: boolean; pageId: string; buttonText: string | null };

export function BioView({ page, orgName, showBranding, pixels, preview = false, theme = "dark", timezone, labels = [], glow = { on: true, color: null }, subscribe, done, order }: { page: BioViewData; orgName: string; showBranding: boolean; pixels?: ShellPixels | null; preview?: boolean; theme?: PublicTheme; timezone?: string | null; labels?: LabelBadge[]; glow?: { on: boolean; color: string | null }; subscribe: BioSubscribe; done?: string | null; order: BioSection[] }) {
  const [hero, ...more] = page.releases ?? [];
  const skin = bioThemeOf(page.theme);
  const font = bioFontOf(page.font);
  // Paper is the light shell treatment. The org-wide theme preference still wins
  // when it asks for light or system: that switch is the label's, this one is the page's.
  const shellTheme: PublicTheme = bioThemeIsLight(skin) && theme === "dark" ? "light" : theme;
  return (
    <ArtworkPageShell
      preview={preview}
      theme={shellTheme}
      skin={`${bioSkinClass(skin)} ${bioFontClass(font)}`}
      glow={glow.on && bioThemeHasGlow(skin)}
      glowColor={glow.color}
      buttonColor={page.buttonColor}
      imageUrl={page.imageUrl}
      accentColor={page.accentColor}
      background={page.background}
      footer={
        <div className="space-y-3">
          {labels.length > 0 && (
            /* Every part of this is read from the label's own roster row, every render. Nothing
               here is typed by the artist, so it cannot outlive the relationship it describes. */
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              {labels.map((l) => (
                <a key={l.name} href={l.href ?? undefined} className="inline-flex items-center gap-2 text-xs text-white/55 hover:text-white/80">
                  {l.logoUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={l.logoUrl} alt="" loading="lazy" decoding="async" className="h-5 w-5 rounded object-contain" />
                  )}
                  {labelBadgeLine(l)}
                </a>
              ))}
            </div>
          )}
          <ShellFooter showBranding={showBranding} orgName={orgName} />
        </div>
      }
      pixels={pixels}
    >
      <ArtworkHero imageUrl={page.imageUrl} accentColor={page.accentColor} glow={glow.on} glowColor={glow.color} alt={page.title} shape="circle" title={page.title}>
        {page.bio && <p className="mx-auto mt-2 max-w-sm whitespace-pre-line text-balance text-[15px] leading-relaxed text-white/70">{page.bio}</p>}
        {/* Each is a counted tap, the same as a button. Shared with the release page. */}
        <SocialIcons icons={page.socials} preview={preview} />
      </ArtworkHero>

      {/* The blocks below are rendered in the owner's order. `order` is already reconciled by
          lib/bio-sections, so this map always covers every section this version has, once each --
          a key that no longer exists cannot appear here, and a new one cannot be missed. */}
      {order.map((section) => (
        <Fragment key={section}>
          {section === "release" && (
            <>
                  {hero && (
                    /* Nobody maintains this block: it reads the release record droplr already holds. It sits
                       above the links because on release week it is the reason the page was opened. */
                    <a
                      href={preview ? undefined : hero.href}
                      className="glass mt-7 flex items-center gap-3 rounded-2xl p-3 transition hover:scale-[1.01]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={hero.coverUrl} alt="" loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-white/10" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-white/60">
                          {bioReleaseEyebrow(hero.state, hero.releaseDate, timezone)}
                        </span>
                        <span className="block truncate text-[15px] font-semibold">{hero.title}</span>
                        <span className="block truncate text-xs text-white/60">{hero.artistName}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black">
                        {bioReleaseAction(hero.state)}
                      </span>
                    </a>
                  )}
            </>
          )}
          {section === "links" && (
            <>
                  <ul className="mt-7 space-y-2.5">
                    {page.links.map((l) => (
                      <li key={l.id}>
                        <GlassLink
                          /* An email button renders its mailto: straight out of the row. The click-counting
                             redirect refuses anything that is not http(s) on purpose, and a 302 to mailto: is
                             a coin flip inside the in-app browsers these pages are mostly opened from. The
                             cost is that email taps are not counted, which the admin says plainly. */
                          href={preview ? "#" : l.url && isMailto(l.url) ? l.url : `/api/b/${l.id}`} platform={l.platform} label={l.label} action={l.buttonText} icon={l.icon} iconUrl={l.iconUrl} track={!preview} />
                      </li>
                    ))}
                    {page.links.length === 0 && page.merch.length === 0 && page.videos.length === 0 && <li className="glass rounded-2xl p-4 text-center text-sm text-white/70">Links coming soon.</li>}
                  </ul>
            </>
          )}
          {section === "subscribe" && (
            <>
                  {subscribe.on && (
                    /* After the links, never before them. The links are what the page is for, and a form
                       asking for an address is the one thing on here that asks the fan for something instead
                       of giving them something. It earns its place by being below what they came for. */
                    <section className="mt-7">
                      {done === "subscribed" ? (
                        <div role="status" className="glass rounded-2xl p-4 text-center text-sm">
                          <span className="font-semibold">You&apos;re on the list.</span>
                          <span className="mt-1 block text-white/60">{orgName} will email you about new music.</span>
                        </div>
                      ) : (
                        <form
                          method="post"
                          action={preview ? undefined : "/api/bio/subscribe"}
                          className="glass space-y-3 rounded-2xl p-4"
                        >
                          <input type="hidden" name="bioPageId" value={subscribe.pageId} />
                          {/* Honeypot: off-screen rather than display:none, which some bots now skip. */}
                          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0" />
                          <div>
                            <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/50">{subscribeHeading()}</h2>
                          </div>
                          <label htmlFor="bio-email" className="sr-only">Email address</label>
                          <input
                            id="bio-email"
                            name="email"
                            type="email"
                            required
                            maxLength={254}
                            autoComplete="email"
                            inputMode="email"
                            placeholder="you@email.com"
                            className="h-12 w-full rounded-xl border border-white/15 bg-black/40 px-4 text-base placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/60"
                          />
                          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-white/70">
                            <input type="checkbox" name="consent" value="yes" required className="mt-0.5 h-4 w-4 shrink-0 rounded-[3px] accent-white outline outline-1 outline-white/40" />
                            <span>
                              {subscribeConsentLine(orgName)}{" "}
                              <a href={`${SITE_URL}/legal/privacy`} target="_blank" rel="noreferrer" className="underline decoration-white/30 underline-offset-2 hover:text-white">Privacy</a>
                            </span>
                          </label>
                          <button
                            type="submit"
                            disabled={preview}
                            className="h-12 w-full rounded-xl bg-white font-semibold text-black transition active:scale-[0.99] disabled:opacity-70"
                          >
                            {subscribeButtonText(subscribe.buttonText)}
                          </button>
                        </form>
                      )}
                    </section>
                  )}
            </>
          )}
          {section === "video" && page.videos.length > 0 && (
            /* Click to play, never a player on load. The still is droplr's own copy, so a fan who
               only scrolls past makes no request to Google at all; YouTube is contacted when they
               press play, which is the moment the privacy page says it is.

               A featured video sits full size, ready to play. Every other one is a slim tile that
               opens into the same card -- a <details>, so it works with JavaScript off and a closed
               tile never loads its picture. */
            <section className="mt-9">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/50">Videos</h2>
              <ul className="mt-3 space-y-2.5">
                {page.videos.map((v) => (
                  <li key={v.id}>
                    {v.highlight ? (
                      <BioVideo id={v.id} url={v.url} title={v.name} imageUrl={v.imageUrl} preview={preview} />
                    ) : (
                      <details className="group">
                        <summary className="glass flex cursor-pointer list-none items-center gap-3 rounded-2xl p-2.5 pr-3 transition hover:bg-white/[0.12] [&::-webkit-details-marker]:hidden">
                          <span className="relative grid h-11 w-[4.75rem] shrink-0 place-items-center overflow-hidden rounded-lg bg-black/60 ring-1 ring-white/10">
                            {v.imageUrl && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={v.imageUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                            )}
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="relative ml-0.5 h-4 w-4 fill-white drop-shadow"><path d="M8 5.5v13l11-6.5z" /></svg>
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{v.name}</span>
                          <span className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black"><span className="group-open:hidden">Watch</span><span className="hidden group-open:inline">Close</span></span>
                        </summary>
                        <div className="mt-2.5"><BioVideo id={v.id} url={v.url} title={v.name} imageUrl={v.imageUrl} preview={preview} /></div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {section === "merch" && page.merch.length > 0 && (
            /* Picture and name, no price. A price typed here is wrong the day it changes in the
               shop, and the shop is one tap away. Each card is a counted tap like any button.

               By default the whole block is one "Merch" button that opens it, so eight products
               don't turn a page of links into a shop window. The owner can put it on the page
               instead, and pick tiles or a swipeable row either way. */
            <section className="mt-7">
              {page.merchDisplay.show === "button" ? (
                <details className="group">
                  <summary className="glass flex cursor-pointer list-none items-center gap-3 rounded-2xl p-2.5 pr-3 transition hover:bg-white/[0.12] [&::-webkit-details-marker]:hidden">
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/10">
                      {page.merch[0].imageUrl && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={page.merch[0].imageUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">Merch</span>
                    <span className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black"><span className="group-open:hidden">Shop</span><span className="hidden group-open:inline">Close</span></span>
                  </summary>
                  <MerchItems items={page.merch} layout={page.merchDisplay.layout} preview={preview} />
                </details>
              ) : (
                <>
                  <h2 className="mt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/50">Merch</h2>
                  <MerchItems items={page.merch} layout={page.merchDisplay.layout} preview={preview} />
                </>
              )}
            </section>
          )}
          {section === "catalogue" && (
            <>
                  {more.length > 0 && (
                    /* Everything else they have out, newest first, under the links rather than over them:
                       the links are what the page is for, and a back catalogue would bury them. */
                    <section className="mt-9">
                      <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/50">More releases</h2>
                      <ul className="mt-3 space-y-2">
                        {more.map((r) => (
                          <li key={r.href}>
                            <a href={preview ? undefined : r.href} className="glass flex items-center gap-3 rounded-xl p-2 transition hover:scale-[1.01]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={r.coverUrl} alt="" loading="lazy" decoding="async" className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-white/10" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{r.title}</span>
                                <span className="block truncate text-[11px] text-white/55">{bioReleaseEyebrow(r.state, r.releaseDate, timezone)}</span>
                              </span>
                              <span className="shrink-0 text-[11px] font-semibold text-white/70">{bioReleaseAction(r.state)}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
            </>
          )}
        </Fragment>
      ))}
    </ArtworkPageShell>
  );
}
