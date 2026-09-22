import { after, NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { progressFor, remaining, signUnlock, verifyUnlock } from "@/lib/downloads";
import { ANON_COOKIE, isBot, requestMeta } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * Hand over the download — and the only place the destination URL is ever disclosed.
 *
 * The gate page never renders downloadUrl, not even hidden. Most gates leak exactly there: the
 * real link sits in a data attribute or a display:none anchor, and View Source walks straight
 * past everything the fan was supposed to do. Here the URL exists server-side until the moment
 * someone has actually earned it.
 *
 * Two ways in, both requiring the work to have been done:
 *  - the visitor's own progress row shows every required step complete, or
 *  - a signed token issued for this release (?t=), so a "download again" link keeps working for
 *    30 minutes without re-gating, and can't be replayed against a different gate.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await ctx.params;
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: { id: true, kind: true, isPublic: true, downloadUrl: true, gateSteps: true },
  });
  if (!release || release.kind !== "download" || !release.isPublic || !release.downloadUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = req.nextUrl.searchParams.get("t");
  const anonId = req.cookies.get(ANON_COOKIE)?.value ?? null;

  let allowed = !!(token && (await verifyUnlock(token, releaseId)));
  let unlockId: string | null = null;

  if (!allowed) {
    const progress = await progressFor(releaseId, anonId);
    const left = remaining(release.gateSteps, progress?.via ?? []);
    allowed = left.length === 0;
    unlockId = progress?.id ?? null;
    // 403, not a redirect: a gate that bounces you back to itself looks broken, and this only
    // happens to someone who reached the URL without doing the steps.
    if (!allowed) return NextResponse.json({ error: "Finish the steps first" }, { status: 403 });
  }

  if (anonId && !isBot(req.headers.get("user-agent"))) {
    const meta = requestMeta(req.headers);
    after(() =>
      prisma.clickEvent.create({
        data: {
          releaseId, platform: "gate:download",
          country: meta.country, timezone: meta.timezone, deviceType: meta.deviceType,
          anonId, ipHash: meta.ipHash, referrer: meta.referrer,
        },
      }).catch(() => {}),
    );
  }

  const res = NextResponse.redirect(release.downloadUrl, 302);
  // Never cached and never indexed: this URL is the thing the gate protects.
  res.headers.set("cache-control", "no-store, private");
  res.headers.set("x-robots-tag", "noindex, nofollow");
  if (unlockId) res.headers.set("x-droplr-unlock", await signUnlock(releaseId, unlockId));
  return res;
}
