import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiUser, isLabelRole } from "@/lib/auth";
import { CLIP_STYLES } from "@/lib/clip-motion";
import { prisma } from "@/lib/db";
import { internalSlugs } from "@/lib/platform-stats";
import { grantedRelease } from "@/lib/roster-grant";
import { over, record } from "@/lib/throttle";

export const dynamic = "force-dynamic";

const schema = z.object({
  releaseId: z.string().min(1).max(64),
  style: z.enum(CLIP_STYLES),
});

/**
 * The clip engine reports a finished render here, for the platform tally.
 *
 * The row it writes is anonymous: the style, whether it came from one of droplr's own accounts, and
 * the day. Not the account, the release, the length or the moment, because the privacy policy says
 * droplr doesn't record who made a clip or what was in it. The release id is only used here, to
 * check that the caller may make a clip of it (the same three paths as the clip page). Whether it
 * counts as droplr's own is decided from the caller's account at this moment. Rate-limited per
 * account so a loop in a tab can't inflate the count.
 */
export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { releaseId, style } = parsed.data;

  let organizationId: string | null = null;
  if (isLabelRole(user.role)) {
    const own = await prisma.release.findFirst({ where: { id: releaseId, organizationId: user.organizationId }, select: { organizationId: true } });
    organizationId = own?.organizationId ?? (await grantedRelease(user.id, releaseId))?.organizationId ?? null;
  } else {
    const assigned = await prisma.release.findFirst({
      where: { id: releaseId, organizationId: user.organizationId, OR: [{ artistId: user.id }, { artistProfile: { userId: user.id } }] },
      select: { organizationId: true },
    });
    organizationId = assigned?.organizationId ?? null;
  }
  if (!organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Ten an hour per account is more than a person makes; past it, nothing is written at all (not even
  // the throttle row), so a loop can neither inflate the tally nor grow the throttle table.
  const key = `clip-render:${user.organizationId}`;
  if (await over(key, 10, 60 * 60 * 1000)) return new NextResponse(null, { status: 204 });
  await record(key);
  // Internal means the person rendering is on one of droplr's own accounts, whoever owns the release.
  const ours = internalSlugs();
  const slug = ours.length ? (await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { slug: true } }))?.slug : null;
  // The day only, not the moment: a timestamp to the millisecond could be lined up with the throttle
  // row or a request log to say whose clip it was. The month figures only need the day.
  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  await prisma.clipRender.create({ data: { style, internal: !!slug && ours.includes(slug.toLowerCase()), createdAt: day } });
  return new NextResponse(null, { status: 204 });
}
