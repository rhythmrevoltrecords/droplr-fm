import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyLegacyToken, verifyToken } from "@/lib/crypto";
import { deezerGloballyEnabled, SITE_URL } from "@/lib/env";
import { deezerAuthorizeUrl } from "@/lib/deezer";
import { packState, releasePageUrl, requestOrigin, safeReturnUrl, spotifyRedirectUri, withParam } from "@/lib/oauth";
import { getSpotifyCreds, spotifyAuthorizeUrl } from "@/lib/spotify";
import { capText, fanTimezone, requestMeta, resolveSource, SRC_COOKIE, ANON_COOKIE } from "@/lib/tracking";
import { isListenChoice } from "@/lib/platforms";
import { planOf } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * Every outbound button on a release page goes through here.
 * Logs the ClickEvent server-side FIRST, then redirects. Works with JavaScript disabled.
 * GET  = smart link buttons.  POST = pre-save form buttons (carries email + consent).
 */
async function handle(req: NextRequest, params: { releaseId: string; platform: string }, method: "GET" | "POST") {
  const q = req.nextUrl.searchParams;
  const status = method === "POST" ? 303 : 302;
  const release = await prisma.release.findUnique({
    where: { id: params.releaseId },
    include: { organization: true, links: { where: { visible: true }, orderBy: { position: "asc" } } },
  });
  if (!release) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const variantId = q.get("variant") || q.get("variantId") || null;
  const variant = variantId ? await prisma.linkVariant.findFirst({ where: { id: variantId, releaseId: release.id } }) : null;
  const meta = requestMeta(req.headers);
  const anonId = req.cookies.get(ANON_COOKIE)?.value ?? req.headers.get("x-anon-id");
  // Built from the Host header: fall back to the platform URL if that isn't one of our hosts.
  const pageUrl = await safeReturnUrl(releasePageUrl(req, release.organization, release.slug, variant?.slug), `${SITE_URL}/${release.organization.slug}/${release.slug}${variant?.slug ? `/${variant.slug}` : ""}`);
  const { host } = requestOrigin(req);
  const source = resolveSource({ variantSource: variant?.source, utmSource: q.get("utm_source"), referrer: meta.referrer, selfHosts: [host] });

  // Release-day email click? (signed pst token → PreSave id)
  let convertedToPreSave = false;
  // Legacy pst links (emailed before audiences) have ps and no act/sub claim.
  const pst =
    (await verifyToken<{ ps: string }>(q.get("pst"), "pst")) ??
    (await verifyLegacyToken<{ ps?: string; act?: string; sub?: string }>(q.get("pst")).then((t) => (t && !t.act && !t.sub ? t : null)));
  if (pst?.ps) {
    const ps = await prisma.preSave.findFirst({ where: { id: pst.ps, releaseId: release.id } });
    if (ps) {
      convertedToPreSave = true;
      if (ps.status === "emailed" || ps.status === "pending") {
        await prisma.preSave.update({ where: { id: ps.id }, data: { status: "emailed_and_clicked", clickedAt: new Date() } });
      } else if (!ps.clickedAt) {
        await prisma.preSave.update({ where: { id: ps.id }, data: { clickedAt: new Date() } });
      }
    }
  }

  // Which button? ?l={linkId} identifies it exactly (needed when a platform appears more than once,
  // e.g. three SoundCloud links on a mashup pack). Older links without ?l fall back to the first match.
  const linkParam = q.get("l");
  const link =
    (linkParam ? release.links.find((l) => l.id === linkParam) : undefined) ??
    release.links.find((l) => l.platform === params.platform);

  // 1) LOG before redirect
  if (!meta.bot) {
    await prisma.$transaction([
      prisma.clickEvent.create({
        data: {
          releaseId: release.id,
          variantId: variant?.id,
          platform: params.platform,
          linkId: link?.platform === params.platform ? link.id : null,
          source,
          utm_source: capText(q.get("utm_source")),
          utm_medium: capText(q.get("utm_medium")),
          utm_campaign: capText(q.get("utm_campaign") ?? variant?.utm_campaign),
          referrer: meta.referrer?.slice(0, 500),
          country: meta.country,
          deviceType: meta.deviceType,
          ipHash: meta.ipHash,
          anonId,
          convertedToPreSave,
        },
      }),
      ...(variant ? [prisma.linkVariant.update({ where: { id: variant.id }, data: { clicks: { increment: 1 } } })] : []),
    ]);
  }

  const finish = (url: string) => {
    const res = NextResponse.redirect(url, status);
    if (variant) res.cookies.set(SRC_COOKIE, variant.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return res;
  };

  // 2) Pre-save flows
  if (q.get("mode") === "presave") {
    let email: string | null = null;
    let tz: string | null = meta.timezone;
    let listenOn: string | null = null;
    if (method === "POST") {
      const form = await req.formData().catch(() => null);
      const e = String(form?.get("email") ?? "").trim().toLowerCase();
      if (form?.get("consent") === "yes" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) email = e;
      tz = fanTimezone(form?.get("tz"), req.headers);
      const lo = form?.get("listenOn");
      if (isListenChoice(lo)) listenOn = lo;
    }
    const baseState = { rid: release.id, org: release.organizationId, vid: variant?.id ?? req.cookies.get(SRC_COOKIE)?.value ?? null, anon: anonId, em: email, src: source, tz, lo: listenOn, ret: pageUrl };

    if (params.platform === "spotify") {
      const creds = planOf(release.organization.plan).byoSpotify || process.env.SPOTIFY_PLATFORM_FALLBACK === "true" ? await getSpotifyCreds(release.organizationId) : null;
      if (!creds) return finish(withParam(pageUrl, "notice", "spotify-unavailable"));
      const ru = spotifyRedirectUri(req);
      return finish(spotifyAuthorizeUrl(creds, ru, packState({ ...baseState, ru })));
    }
    if (params.platform === "deezer") {
      if (!deezerGloballyEnabled() || !release.organization.deezerEnabled) return finish(withParam(pageUrl, "notice", "error"));
      return finish(deezerAuthorizeUrl(packState({ ...baseState, ru: process.env.DEEZER_REDIRECT_URI ?? "" })));
    }
    if (params.platform === "appleMusic") {
      // Apple Music's own album page has a Pre-add button for upcoming releases, so send fans there whenever a link exists.
      const apple = release.links.find((l) => l.platform === "appleMusic");
      if (apple && /^https:\/\/(music|itunes)\.apple\.com\//i.test(apple.url)) return finish(apple.url);
      return finish(withParam(pageUrl, "notice", "apple-soon"));
    }
  }

  // 3) Follow on Spotify: a plain link to the artist page (works for every fan; logged above as a click).
  if (params.platform === "spotifyFollow") {
    return finish(release.spotifyArtistId && /^[A-Za-z0-9]{22}$/.test(release.spotifyArtistId) ? `https://open.spotify.com/artist/${release.spotifyArtistId}` : pageUrl);
  }

  // 4) Smart link redirect
  if (!link || !/^https?:\/\//i.test(link.url)) return finish(pageUrl);
  return finish(link.url);
}

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ releaseId: string; platform: string }> }
) {
  const params = await props.params;
  return handle(req, params, "GET");
}
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ releaseId: string; platform: string }> }
) {
  const params = await props.params;
  return handle(req, params, "POST");
}
