import { after, NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { completeStep, proofOf } from "@/lib/downloads";
import { ANON_COOKIE, isBot, requestMeta } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * An unverified gate step: open the artist's profile, and take the fan's word for what they do
 * there.
 *
 * This is the whole truth about Instagram, TikTok, YouTube and Spotify follow gates — nobody's
 * checks them, because no API from any of those platforms will tell an app whether a given
 * visitor follows a given account. droplr says so on the page rather than implying otherwise,
 * and this route is where that honesty is implemented: it marks the step done on the click,
 * because the click is genuinely all there is.
 *
 * Refuses to mark a *provable* platform done. Otherwise a SoundCloud step could be completed by
 * visiting this URL instead of authorising, which would turn "performed" into a lie.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ stepId: string }> }) {
  const { stepId } = await ctx.params;
  const step = await prisma.gateStep.findUnique({
    where: { id: stepId },
    include: { release: { select: { id: true, isPublic: true, kind: true } } },
  });
  if (!step || step.release.kind !== "download" || !step.release.isPublic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (proofOf(step.platform) !== "unverified") {
    return NextResponse.json({ error: "That step has to be completed properly" }, { status: 400 });
  }

  const target = step.target && /^https?:\/\//i.test(step.target) ? step.target : null;
  const anonId = req.cookies.get(ANON_COOKIE)?.value ?? null;
  const meta = requestMeta(req.headers);

  if (anonId && !isBot(req.headers.get("user-agent"))) {
    const releaseId = step.release.id;
    const platform = step.platform;
    after(async () => {
      await Promise.all([
        // Same table every other outbound click lands in, so gate steps show up in insights
        // and in per-step drop-off without a second analytics path.
        prisma.clickEvent.create({
          data: {
            releaseId, platform: `gate:${platform}`,
            country: meta.country, timezone: meta.timezone, deviceType: meta.deviceType,
            anonId, ipHash: meta.ipHash, referrer: meta.referrer,
          },
        }).catch(() => {}),
        completeStep({ releaseId, anonId, platform, country: meta.country, timezone: meta.timezone }).catch(() => {}),
      ]);
    });
  }

  if (!target) return NextResponse.json({ error: "That step has no link" }, { status: 400 });
  const res = NextResponse.redirect(target, 302);
  res.headers.set("cache-control", "no-store");
  return res;
}
