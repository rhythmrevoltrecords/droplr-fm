import { headers } from "next/headers";
import { after } from "next/server";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { deezerGloballyEnabled } from "@/lib/env";
import { labelDuplicateLinks } from "@/lib/link-labels";
import { publicTheme } from "./artwork-shell";
import { planOf } from "@/lib/plans";
import type { Resolution } from "@/lib/releases";
import { isReleased, isReleasedFor, releaseInstantFor } from "@/lib/time";
import { requestMeta, resolveSource } from "@/lib/tracking";
import { OrgView } from "./org-view";
import { ReleaseView } from "./release-view";
import { GateView } from "./gate-view";
import { ContestEntry, type ContestView, type GalleryEntry } from "./contest-entry";
import { galleryVisible, PUBLIC_GALLERY_FROM_VERSION } from "@/lib/contest";
import { getSoundCloudCreds } from "@/lib/soundcloud";
import { progressFor, remaining } from "@/lib/downloads";

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Show the Spotify pre-save button? Needs a working app, and either the label has switched the button on for everyone
 * or the visitor came through a ?spotify=1 VIP link (Development Mode apps only work for 5 allowlisted Spotify users).
 */
export function spotifyEnabledFor(org: { plan: string; spotifyAppStatus: string; spotifyClientIdEncrypted: string | null; spotifyPublicButton: boolean }, vip = false) {
  const byo = !!org.spotifyClientIdEncrypted && org.spotifyAppStatus === "active" && planOf(org.plan).byoSpotify && (org.spotifyPublicButton || vip);
  const platform = process.env.SPOTIFY_PLATFORM_FALLBACK === "true" && !!process.env.SPOTIFY_CLIENT_ID;
  return byo || platform;
}

/**
 * A remix contest, flattened for the client component. Dates go over as ISO strings because this
 * crosses the server/client boundary, and only the counts the public page is allowed to see come
 * with it — never an entry, never an entrant's address.
 */
async function contestViewOf(
  c: NonNullable<Resolution & { kind: "release" }>["release"]["contest"],
  /** The label's own zone. The deadline is one instant, but an entrant reads a wall clock — so the
   *  page has to name whose clock it means. */
  timezone: string,
): Promise<ContestView | null> {
  if (!c) return null;
  // Unpublished stops HERE, not in the component. ContestEntry is a client component, so anything
  // handed to it is serialised into the RSC payload inlined in the page's HTML — a draft's headline,
  // brief and prize would sit in View Source while the label believed nothing was public.
  if (!c.published) return null;

  // The gallery is a second query on purpose, and only once entries have closed. Putting it in the
  // shared release loader would pay for it on every release page in the product to serve the handful
  // that have a closed contest — and, worse, would carry entrants' rows into the RSC payload of pages
  // that must not show them. Not loading it is a stronger guarantee than not rendering it.
  const gallery: GalleryEntry[] = galleryVisible(c)
    ? (
        await prisma.contestEntry.findMany({
          where: {
            contestId: c.id,
            withdrawnAt: null,
            // Entered under a wording that said so. v1 said "happy for the label to listen to it",
            // which is not consent to a public page with a vote button on it.
            declarationVersion: { gte: PUBLIC_GALLERY_FROM_VERSION },
          },
          orderBy: { createdAt: "asc" },
          take: 300,
          select: {
            id: true, artistName: true, link: true, linkHost: true, note: true, status: true,
            _count: { select: { votes: true } },
          },
        })
      ).map((e) => ({
        id: e.id,
        artistName: e.artistName,
        link: e.link,
        linkHost: e.linkHost,
        note: e.note,
        winner: e.status === "winner",
        votes: e._count.votes,
      }))
    : [];

  return {
    timezone,
    gallery,
    id: c.id,
    headline: c.headline,
    brief: c.brief,
    prize: c.prize,
    rulesUrl: c.rulesUrl,
    opensAt: c.opensAt ? c.opensAt.toISOString() : null,
    closesAt: c.closesAt.toISOString(),
    winnerAnnouncedAt: c.winnerAnnouncedAt ? c.winnerAnnouncedAt.toISOString() : null,
    published: c.published,
    maxPerEntrant: c.maxPerEntrant,
    entryCount: c._count.entries,
  };
}

export async function PublicRoute({ resolution, searchParams, orgHrefBase }: { resolution: Resolution; searchParams: SearchParams; orgHrefBase: (slug: string) => string }) {
  if (!resolution) notFound();
  if (resolution.kind === "redirect") {
    // Legacy /{slug} → /{orgSlug}/{slug}. permanentRedirect = HTTP 308 (treated like 301 by browsers and search engines).
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (k !== "v" && typeof v === "string") qs.set(k, v);
    const to = qs.size ? `${resolution.to}?${qs}` : resolution.to;
    if (resolution.temporary) redirect(to);
    permanentRedirect(to);
  }
  if (resolution.kind === "org") return <OrgView org={resolution.org} hrefBase={orgHrefBase(resolution.org.slug)} />;

  const { release, variant } = resolution;
  const h = await headers();
  const meta = requestMeta(h);
  const query = Object.fromEntries(Object.entries(searchParams).map(([k, v]) => [k, one(v)]));

  if (!meta.bot && h.get("purpose") !== "prefetch" && h.get("next-router-prefetch") !== "1" && query.preview !== "1") {
    const host = h.get("x-host") ?? "";
    // after(): the page streams first, then the view is logged; Netlify keeps the function alive until it finishes.
    after(() =>
      prisma.pageView
      .create({
        data: {
          releaseId: release.id,
          variantId: variant?.id,
          source: resolveSource({ variantSource: variant?.source, utmSource: query.utm_source, referrer: meta.referrer, selfHosts: [host] }),
          utm_source: query.utm_source?.slice(0, 200),
          utm_medium: query.utm_medium?.slice(0, 200),
          utm_campaign: (query.utm_campaign ?? variant?.utm_campaign)?.slice(0, 200),
          referrer: meta.referrer?.slice(0, 500),
          country: meta.country,
          timezone: meta.timezone,
          deviceType: meta.deviceType,
          ipHash: meta.ipHash,
          anonId: h.get("x-anon-id"),
        },
      })
      .catch((e) => console.error("pageview log failed", e)),
    );
  }

  const org = release.organization;

  // A download gate is the same Release record with a different front door: no store links, no
  // release day, a list of actions and a file at the end.
  if (release.kind === "download") {
    const anonId = h.get("x-anon-id");
    const progress = await progressFor(release.id, anonId);
    const via = progress?.via ?? [];
    // Hide a SoundCloud step rather than show one that can't work: without a key the fan would
    // bounce to a SoundCloud error page and blame the artist.
    const scCreds = release.gateSteps.some((s) => s.platform === "soundcloud")
      ? await getSoundCloudCreds(release.organizationId)
      : null;
    const steps = release.gateSteps.map((s) => ({
      id: s.id,
      platform: s.platform,
      action: s.action,
      target: s.target,
      required: s.required,
      done: via.includes(s.platform),
      available: s.platform !== "soundcloud" || (!!scCreds && !!s.targetId),
    }));
    const usable = steps.filter((s) => s.available);
    return (
      <GateView
        release={{
          id: release.id,
          title: release.title,
          artistName: release.artistName,
          coverUrl: release.coverUrl,
          accentColor: release.accentColor ?? org.accentColor,
          downloadNote: release.downloadNote,
          org: { name: org.name, metaPixelId: planOf(org.plan).pixels ? org.metaPixelId : null, tiktokPixelId: planOf(org.plan).pixels ? org.tiktokPixelId : null, ga4Id: planOf(org.plan).pixels ? org.ga4Id : null, timezone: org.timezone },
        }}
        steps={steps}
        unlocked={remaining(usable, via).length === 0}
        query={query}
        showBranding={!planOf(org.plan).removeBranding}
        theme={publicTheme(org)}
        contest={await contestViewOf(release.contest, org.timezone)}
      />
    );
  }

  // Local rollout: the page flips to "Out now" at the visitor's own midnight, like the stores do.
  const viewerTz = meta.timezone;
  const live = isReleasedFor(release, org.timezone, viewerTz);
  const unlockAt = releaseInstantFor(release, org.timezone, viewerTz);
  return (
    <ReleaseView
      release={{
        id: release.id,
        title: release.title,
        artistName: release.artistName,
        coverUrl: release.coverUrl,
        accentColor: release.accentColor ?? org.accentColor,
        releaseDate: unlockAt.toISOString(),
        spotifyArtistId: release.spotifyArtistId,
        links: labelDuplicateLinks(release.links).map((l) => ({ id: l.id, platform: l.platform, label: l.label, url: l.url, buttonText: l.buttonText, icon: l.icon })),
        org: { name: org.name, metaPixelId: planOf(org.plan).pixels ? org.metaPixelId : null, tiktokPixelId: planOf(org.plan).pixels ? org.tiktokPixelId : null, ga4Id: planOf(org.plan).pixels ? org.ga4Id : null, logoUrl: org.logoUrl, timezone: release.rollout === "global" || !viewerTz ? org.timezone : viewerTz },
      }}
      live={live}
      variantId={variant?.id}
      query={query}
      spotifyEnabled={spotifyEnabledFor(org, query.spotify === "1")}
      deezerEnabled={deezerGloballyEnabled() && org.deezerEnabled}
      showBranding={!planOf(org.plan).removeBranding}
      theme={publicTheme(org)}
      contest={await contestViewOf(release.contest, org.timezone)}
    />
  );
}

export async function releaseMetadata(resolution: Resolution) {
  if (!resolution || resolution.kind === "redirect") return {};
  if (resolution.kind === "org") {
    // Set images explicitly so label pages (often on the label's own domain) don't inherit droplr.fm's homepage social card.
    const images = resolution.org.logoUrl ? [resolution.org.logoUrl] : [];
    return { title: resolution.org.name, openGraph: { title: resolution.org.name, images }, twitter: { card: "summary" as const, title: resolution.org.name, images } };
  }
  const r = resolution.release;
  const live = isReleased(r.releaseDate);
  const title = `${r.title} — ${r.artistName}`;
  // A gate page has no release day, so "Pre-save" would be nonsense on it. The page itself is
  // worth indexing — it's a free download someone might search for — while the unlock route
  // sends noindex, because that one is the file.
  const description =
    r.kind === "download"
      ? `Free download: ${r.title} by ${r.artistName}.`
      : live
        ? `Listen to ${r.title} by ${r.artistName} on your favourite platform.`
        : `Pre-save ${r.title} by ${r.artistName}.`;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, images: [{ url: r.coverUrl, width: 640, height: 640 }], type: r.kind === "download" ? ("website" as const) : ("music.album" as const) },
    twitter: { card: "summary_large_image" as const, title, description, images: [r.coverUrl] },
  };
}
