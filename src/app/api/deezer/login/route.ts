import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { deezerGloballyEnabled, SITE_URL } from "@/lib/env";
import { deezerAuthorizeUrl } from "@/lib/deezer";
import { packState, releasePageUrl, safeReturnUrl, withParam } from "@/lib/oauth";
import { ANON_COOKIE, SRC_COOKIE } from "@/lib/tracking";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const release = await prisma.release.findUnique({ where: { id: req.nextUrl.searchParams.get("releaseId") ?? "" }, include: { organization: true } });
  if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });
  // Built from the Host header: fall back to the platform URL if that isn't one of our hosts.
  const pageUrl = await safeReturnUrl(releasePageUrl(req, release.organization, release.slug), `${SITE_URL}/${release.organization.slug}/${release.slug}`);
  if (!deezerGloballyEnabled() || !release.organization.deezerEnabled) return NextResponse.redirect(withParam(pageUrl, "notice", "error"));
  const state = packState({
    rid: release.id, org: release.organizationId,
    vid: req.nextUrl.searchParams.get("variantId") ?? req.cookies.get(SRC_COOKIE)?.value ?? null,
    anon: req.cookies.get(ANON_COOKIE)?.value ?? null, ret: pageUrl, ru: process.env.DEEZER_REDIRECT_URI ?? "",
  });
  return NextResponse.redirect(deezerAuthorizeUrl(state));
}
