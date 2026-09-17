// "Release is live" pushes, run by the release-check job. Relative imports only.
import { prisma } from "./db";
import { pushConfigured, sendPush, teamUserIds } from "./push";

/** Releases whose release moment (account timezone) has passed and haven't announced yet. */
export async function notifyLiveReleases(now = new Date(), force = false) {
  if (!force && !pushConfigured()) return 0;
  const due = await prisma.release.findMany({
    where: { liveNotifiedAt: null, releaseDate: { lte: now, gte: new Date(now.getTime() - 3 * 86_400_000) } },
    select: { id: true, title: true, artistName: true, organizationId: true, artistId: true },
    take: 50,
  });
  let n = 0;
  for (const r of due) {
    const claimed = await prisma.release.updateMany({ where: { id: r.id, liveNotifiedAt: null }, data: { liveNotifiedAt: now } });
    if (!claimed.count) continue;
    const count = await prisma.preSave.count({ where: { releaseId: r.id } });
    await sendPush([...(await teamUserIds(r.organizationId)), ...(r.artistId ? [r.artistId] : [])], "releaseLive", {
      title: `${r.title} is out`,
      body: count ? `${count.toLocaleString("en-AU")} pre-savers get it now, and release-day emails go out at 9am in each fan's timezone.` : `${r.artistName}'s release is live. Share the "out now" graphic.`,
      url: `/admin/releases/${r.id}?tab=share`,
      tag: `live-${r.id}`,
    });
    n++;
  }
  return n;
}
