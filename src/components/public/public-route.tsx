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
  const description = live ? `Listen to ${r.title} by ${r.artistName} on your favourite platform.` : `Pre-save ${r.title} by ${r.artistName}.`;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, images: [{ url: r.coverUrl, width: 640, height: 640 }], type: "music.album" as const },
    twitter: { card: "summary_large_image" as const, title, description, images: [r.coverUrl] },
  };
}
