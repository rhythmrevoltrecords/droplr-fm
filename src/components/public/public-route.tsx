import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { deezerGloballyEnabled } from "@/lib/env";
import { planOf } from "@/lib/plans";
import type { Resolution } from "@/lib/releases";
import { isReleased } from "@/lib/time";
import { requestMeta, resolveSource } from "@/lib/tracking";
import { OrgView } from "./org-view";
import { ReleaseView } from "./release-view";

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function spotifyEnabledFor(org: { plan: string; spotifyAppStatus: string; spotifyClientIdEncrypted: string | null }) {
  const byo = !!org.spotifyClientIdEncrypted && org.spotifyAppStatus === "active" && planOf(org.plan).byoSpotify;
  const platform = process.env.SPOTIFY_PLATFORM_FALLBACK === "true" && !!process.env.SPOTIFY_CLIENT_ID;
  return byo || platform;
}

export async function PublicRoute({ resolution, searchParams, orgHrefBase }: { resolution: Resolution; searchParams: SearchParams; orgHrefBase: (slug: string) => string }) {
  if (!resolution) notFound();
  if (resolution.kind === "org") return <OrgView org={resolution.org} hrefBase={orgHrefBase(resolution.org.slug)} />;

  const { release, variant } = resolution;
  const h = headers();
  const meta = requestMeta(h);
  const query = Object.fromEntries(Object.entries(searchParams).map(([k, v]) => [k, one(v)]));

  if (!meta.bot && h.get("purpose") !== "prefetch" && h.get("next-router-prefetch") !== "1" && query.preview !== "1") {
    const host = h.get("x-host") ?? "";
    await prisma.pageView
      .create({
        data: {
          releaseId: release.id,
          variantId: variant?.id,
          source: resolveSource({ variantSource: variant?.source, utmSource: query.utm_source, referrer: meta.referrer, selfHosts: [host] }),
          utm_source: query.utm_source,
          utm_medium: query.utm_medium,
          utm_campaign: query.utm_campaign ?? variant?.utm_campaign,
          referrer: meta.referrer?.slice(0, 500),
          country: meta.country,
          deviceType: meta.deviceType,
          ipHash: meta.ipHash,
          anonId: h.get("x-anon-id"),
        },
      })
      .catch((e) => console.error("pageview log failed", e));
  }

  const org = release.organization;
  const live = isReleased(release.releaseDate);
  return (
    <ReleaseView
      release={{
        id: release.id,
        title: release.title,
        artistName: release.artistName,
        coverUrl: release.coverUrl,
        accentColor: release.accentColor,
        releaseDate: release.releaseDate.toISOString(),
        links: release.platformLinks.map((l) => ({ id: l.id, platform: l.platform, label: l.label, url: l.url })),
        org: { name: org.name, metaPixelId: planOf(org.plan).pixels ? org.metaPixelId : null, tiktokPixelId: planOf(org.plan).pixels ? org.tiktokPixelId : null, ga4Id: planOf(org.plan).pixels ? org.ga4Id : null, logoUrl: org.logoUrl },
      }}
      live={live}
      variantId={variant?.id}
      query={query}
      spotifyEnabled={spotifyEnabledFor(org)}
      deezerEnabled={deezerGloballyEnabled() && org.deezerEnabled}
      showBranding={!planOf(org.plan).removeBranding}
    />
  );
}

export async function releaseMetadata(resolution: Resolution) {
  if (!resolution) return {};
  if (resolution.kind === "org") return { title: resolution.org.name };
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
