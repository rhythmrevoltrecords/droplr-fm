import { decrypt, encrypt, randomToken, sha256 } from "./crypto";
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
  await prisma.release.update({ where: { id: releaseId }, data: { ...sealed(token), reportToken: null, reportSharedAt: new Date() } });
  return token;
}

/**
 * Looked up by hash, shown again from the encrypted copy. A leaked database dump opens no report;
 * it would also need ENCRYPTION_KEY, which lives only in Netlify.
 */
const sealed = (token: string) => ({ reportTokenHash: sha256(token), reportTokenEncrypted: encrypt(token) });

/** The link for the dashboard, or null when sharing is off (or the copy can't be read). */
export function reportTokenFor(r: { reportTokenEncrypted: string | null }): string | null {
  if (!r.reportTokenEncrypted) return null;
  try {
    return decrypt(r.reportTokenEncrypted);
  } catch {
    return null;
  }
}

/** Turning it off clears the token, so the old URL 404s rather than going quiet. */
export async function disableReport(releaseId: string) {
  await prisma.release.update({ where: { id: releaseId }, data: { reportToken: null, reportTokenHash: null, reportTokenEncrypted: null, reportSharedAt: null } });
}

/**
 * Tokens from before hashing: the migration gave them a hash (so their links work) but SQL can't
 * encrypt, so the plaintext waits here. Run from the scheduled release check; returns how many.
 */
export async function sealLegacyReportTokens(deadline = Date.now() + 20_000): Promise<number> {
  const rows = await prisma.release.findMany({ where: { reportToken: { not: null } }, select: { id: true, reportToken: true }, take: 500 });
  let n = 0;
  for (const r of rows) {
    if (Date.now() > deadline) break;
    // Only if nothing changed since the read: a disable landing in between must not be undone.
    const done = await prisma.release.updateMany({ where: { id: r.id, reportToken: r.reportToken }, data: { ...sealed(r.reportToken!), reportToken: null } });
    n += done.count;
  }
  // The old code's disable cleared reportToken and reportSharedAt but knew nothing of the hash the
  // migration added, so a link turned off during a deploy would keep a hash. Clear it.
  await prisma.release.updateMany({ where: { reportSharedAt: null, OR: [{ reportTokenHash: { not: null } }, { reportTokenEncrypted: { not: null } }] }, data: { reportTokenHash: null, reportTokenEncrypted: null } });
  return n;
}

export async function reportByToken(token: string) {
  if (!token || token.length < 16 || token.length > 64) return null;
  const release = await prisma.release.findFirst({
    // reportSharedAt too: it is what "sharing is on" means, and a disable by older code cleared it.
    where: { reportTokenHash: sha256(token), reportSharedAt: { not: null } },
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
