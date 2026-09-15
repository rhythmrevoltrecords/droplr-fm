import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { unpackState, withParam } from "@/lib/oauth";
import { exchangeCode, getMe, getSpotifyCreds, saveToLibrary } from "@/lib/spotify";
import { isReleased } from "@/lib/time";
import { requestMeta } from "@/lib/tracking";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const state = unpackState(sp.get("state"));
  if (!state) return NextResponse.json({ error: "Invalid or expired state. Go back and try again." }, { status: 400 });
  if (sp.get("error") || !sp.get("code")) return NextResponse.redirect(withParam(state.ret, "notice", "spotify-denied"));

  // Multi-tenant: state carries the org → decrypt THAT org's client secret.
  const creds = await getSpotifyCreds(state.org);
  const release = await prisma.release.findUnique({ where: { id: state.rid } });
  if (!creds || !release || release.organizationId !== state.org) return NextResponse.redirect(withParam(state.ret, "notice", "spotify-unavailable"));

  try {
    const token = await exchangeCode(creds, sp.get("code")!, state.ru);
    const me = await getMe(token.access_token);
    // Development Mode apps return 403 for users not on the app's allowlist.
    if (!me) return NextResponse.redirect(withParam(state.ret, "notice", "spotify-not-allowed"));
    if (!token.refresh_token) throw new Error("No refresh token returned");

    const existing = await prisma.preSave.findFirst({ where: { releaseId: release.id, platform: "spotify", spotifyUserId: me.id } });
    const data = {
      refreshTokenEncrypted: encrypt(token.refresh_token),
      email: state.em ?? existing?.email ?? null,
      emailConsent: !!state.em || !!existing?.emailConsent,
      sourceVariantId: state.vid ?? existing?.sourceVariantId ?? null,
      source: state.src ?? existing?.source ?? null,
      anonId: state.anon ?? null,
      country: requestMeta(req.headers).country ?? me.country ?? null,
    };
    const ps = existing
      ? await prisma.preSave.update({ where: { id: existing.id }, data: { ...data, status: existing.status === "completed" ? "completed" : "pending" } })
      : await prisma.preSave.create({ data: { ...data, releaseId: release.id, platform: "spotify", spotifyUserId: me.id, status: "pending" } });

    // Attribute the most recent click from this visitor as converted
    if (state.anon) {
      const click = await prisma.clickEvent.findFirst({ where: { releaseId: release.id, anonId: state.anon, platform: "spotify" }, orderBy: { createdAt: "desc" } });
      if (click) await prisma.clickEvent.update({ where: { id: click.id }, data: { convertedToPreSave: true } });
    }

    // Already out? Save right now.
    if (isReleased(release.releaseDate)) {
      try {
        await saveToLibrary(token.access_token, { albumId: release.spotifyAlbumId, trackId: release.spotifyTrackId, artistId: release.spotifyArtistId });
        await prisma.preSave.update({ where: { id: ps.id }, data: { status: "completed", completedAt: new Date(), attempts: { increment: 1 } } });
        return NextResponse.redirect(withParam(state.ret, "done", "spotify-saved"));
      } catch (e) {
        await prisma.preSave.update({ where: { id: ps.id }, data: { lastError: String(e).slice(0, 500), attempts: { increment: 1 } } });
      }
    }
    return NextResponse.redirect(withParam(state.ret, "done", "spotify"));
  } catch (e) {
    console.error("[spotify callback]", e);
    return NextResponse.redirect(withParam(state.ret, "notice", "error"));
  }
}
