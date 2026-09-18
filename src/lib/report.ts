import { randomToken } from "./crypto";
import { prisma } from "./db";
import { getStats } from "./analytics";

/**
 * The shareable release report: a public, unguessable page a label can send to a
 * distributor, a manager or a grant body instead of screenshotting the dashboard.
 *
 * Two rules it must never break:
 *  - Aggregate only. No email address, no individual fan row, nothing that identifies a
 *    person. The numbers here are counts and country/store totals, and nothing else.
 *  - Off until the label turns it on. A report has no token until someone asks for one,
 *    and turning it off clears the token so the old link stops resolving immediately.
 */

export const reportUrlPath = (token: string) => `/report/${token}`;

export async function enableReport(releaseId: string) {
  const token = randomToken(18); // ~29 chars of base64url: not guessable, still pasteable
  await prisma.release.update({ where: { id: releaseId }, data: { reportToken: token, reportSharedAt: new Date() } });
  return token;
}

/** Turning it off clears the token, so the old URL 404s rather than going quiet. */
export async function disableReport(releaseId: string) {
  await prisma.release.update({ where: { id: releaseId }, data: { reportToken: null, reportSharedAt: null } });
}

export async function reportByToken(token: string) {
  if (!token || token.length < 16 || token.length > 64) return null;
  const release = await prisma.release.findFirst({
    where: { reportToken: token },
    select: {
      id: true,
      title: true,
      artistName: true,
      coverUrl: true,
      accentColor: true,
      releaseDate: true,
      slug: true,
      reportSharedAt: true,
      organization: { select: { name: true, slug: true, logoUrl: true, timezone: true, accentColor: true, plan: true, customDomain: true, customDomainLiveAt: true, planUpdatedAt: true } },
    },
  });
  if (!release) return null;

  // 365 days so a report of an older release still reads sensibly; the page shows the window.
  const stats = await getStats([release.id], 365, release.organization.timezone);

  return {
    release,
    org: release.organization,
    totals: {
      views: stats.views,
      clicks: stats.clicks,
      presaves: stats.presaves,
      ctr: stats.ctr,
      conv: stats.conv,
    },
    byPlatform: stats.byPlatform.slice(0, 8),
    byCountry: stats.byCountry.slice(0, 8),
    byListenOn: stats.byListenOn.slice(0, 8),
    bySource: stats.bySource.slice(0, 6),
    daily: stats.daily,
  };
}

export type ReportData = NonNullable<Awaited<ReturnType<typeof reportByToken>>>;
