import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { packState, releasePageUrl, safeReturnUrl, spotifyRedirectUri, withParam } from "@/lib/oauth";
import { getSpotifyCreds, spotifyAuthorizeUrl } from "@/lib/spotify";
import { ANON_COOKIE, SRC_COOKIE } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/** GET /api/spotify/login?releaseId=…&variantId=… — multi-tenant: uses the release's org BYO Spotify app. */
export async function GET(req: NextRequest) {
  const releaseId = req.nextUrl.searchParams.get("releaseId") ?? "";
  const release = await prisma.release.findUnique({ where: { id: releaseId }, include: { organization: true } });
  if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });
  // Built from the Host header: fall back to the platform URL if that isn't one of our hosts.
  const pageUrl = await safeReturnUrl(releasePageUrl(req, release.organization, release.slug), `${SITE_URL}/${release.organization.slug}/${release.slug}`);

  const creds = await getSpotifyCreds(release.organizationId);
  if (!creds) return NextResponse.redirect(withParam(pageUrl, "notice", "spotify-unavailable"));

  const ru = spotifyRedirectUri(req);
  const state = packState({
    rid: release.id,
    org: release.organizationId,
    vid: req.nextUrl.searchParams.get("variantId") ?? req.cookies.get(SRC_COOKIE)?.value ?? null,
    anon: req.cookies.get(ANON_COOKIE)?.value ?? null,
    em: null,
    ret: pageUrl,
    ru,
  });
  return NextResponse.redirect(spotifyAuthorizeUrl(creds, ru, state));
}
