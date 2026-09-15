// Shared by Netlify functions (release-check, process-presaves-background) and the manual cron API route.
// Relative imports only — this file is bundled by Netlify's esbuild outside Next.
import { prisma } from "./db";
import { decrypt, encrypt } from "./crypto";
import { SITE_URL, deezerGloballyEnabled } from "./env";
import { resolveWithOdesli } from "./odesli";
import { PLATFORMS, platformMeta } from "./platforms";
import { getSpotifyCreds, refreshAccessToken, saveToLibrary, SpotifyError, spotifyUrl } from "./spotify";
import { deezerSaveAlbum, parseDeezerAlbumId } from "./deezer";
import { emailConfigured, releaseDayEmail, sendBatch } from "./email";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ProcessResult = { releaseId: string; resolvedLinks: number; spotifyDone: number; spotifyFailed: number; deezerDone: number; emailed: number; stoppedEarly: boolean; notes: string[] };

/** Step 1: releases that just went live → re-resolve links via Odesli (if enabled) and flip status. */
export async function reResolveRelease(releaseId: string) {
  const release = await prisma.release.findUnique({ where: { id: releaseId }, include: { platformLinks: true } });
  if (!release) return 0;
  const source = release.spotifyUrl ?? (release.spotifyAlbumId ? spotifyUrl({ type: "album", id: release.spotifyAlbumId }) : release.spotifyTrackId ? spotifyUrl({ type: "track", id: release.spotifyTrackId }) : null);
  if (!source) return 0;
  const resolved = await resolveWithOdesli(source);
  if (!resolved.found) return 0;

  const existing = new Set(release.platformLinks.map((l) => l.platform));
  let order = release.platformLinks.reduce((m, l) => Math.max(m, l.order), -1) + 1;
  const toCreate = resolved.links
    .filter((l) => !existing.has(l.platform))
    .sort((a, b) => PLATFORMS[a.platform].weight - PLATFORMS[b.platform].weight)
    .map((l) => ({ releaseId, platform: l.platform, url: l.url, order: order++ }));
  if (toCreate.length) await prisma.platformLink.createMany({ data: toCreate });
  await prisma.release.update({
    where: { id: releaseId },
    data: { resolvedAt: new Date(), coverUrl: release.coverUrl || resolved.coverUrl || release.coverUrl },
  });
  return toCreate.length;
}

async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>, shouldStop: () => boolean) {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length && !shouldStop()) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/** Step 2+3: process true saves (BYO Spotify / Deezer) then release-day emails. Resumable: only touches pending rows. */
export async function processRelease(releaseId: string, deadlineMs = Date.now() + 14 * 60 * 1000): Promise<ProcessResult> {
  const out: ProcessResult = { releaseId, resolvedLinks: 0, spotifyDone: 0, spotifyFailed: 0, deezerDone: 0, emailed: 0, stoppedEarly: false, notes: [] };
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: { organization: true, platformLinks: { where: { isActive: true }, orderBy: { order: "asc" } } },
  });
  if (!release) return out;
  if (release.releaseDate.getTime() > Date.now()) {
    out.notes.push("not released yet");
    return out;
  }

  if (release.status !== "live") {
    if (release.autoReResolve) {
      out.resolvedLinks = await reResolveRelease(releaseId).catch((e) => {
        out.notes.push(`odesli: ${e}`);
        return 0;
      });
    }
    await prisma.release.update({ where: { id: releaseId }, data: { status: "live" } });
  }

  let quotaStop = false;
  const stop = () => quotaStop || Date.now() > deadlineMs;

  // --- Spotify true saves (only rows created via a BYO app OAuth) ---
  const creds = await getSpotifyCreds(release.organizationId);
  if (creds) {
    for (;;) {
      if (stop()) break;
      const batch = await prisma.preSave.findMany({
        where: { releaseId, platform: "spotify", status: "pending", refreshTokenEncrypted: { not: null }, attempts: { lt: 5 } },
        take: 500,
        orderBy: { createdAt: "asc" },
      });
      if (!batch.length) break;
      await pool(batch, 50, async (ps) => {
        let attempt = 0;
        for (;;) {
          try {
            const token = await refreshAccessToken(creds, decrypt(ps.refreshTokenEncrypted!));
            await saveToLibrary(token.access_token, { albumId: release.spotifyAlbumId, trackId: release.spotifyTrackId, artistId: release.spotifyArtistId });
            await prisma.preSave.update({
              where: { id: ps.id },
              data: {
                status: "completed",
                completedAt: new Date(),
                attempts: { increment: 1 },
                lastError: null,
                ...(token.refresh_token ? { refreshTokenEncrypted: encrypt(token.refresh_token) } : {}),
              },
            });
            out.spotifyDone++;
            return;
          } catch (e) {
            const err = e as SpotifyError;
            if (err.status === 429 && err.quotaExceeded) {
              quotaStop = true;
              out.notes.push("Spotify QUOTA_EXCEEDED — remaining saves stay pending for the next hourly run");
              return;
            }
            if (err.status === 429 && attempt < 5) {
              attempt++;
              await sleep(Math.min((err.retryAfter ?? 2) * 1000 * attempt, 30_000));
              continue;
            }
            const failed = ps.attempts + 1 >= 5 || err.status === 400 || err.status === 401 || err.status === 403;
            await prisma.preSave.update({
              where: { id: ps.id },
              data: { attempts: { increment: 1 }, lastError: String(err.message).slice(0, 500), status: failed ? "failed" : "pending" },
            });
            if (failed) out.spotifyFailed++;
            return;
          }
        }
      }, stop);
      if (batch.length < 500) break;
    }
  } else {
    const orphaned = await prisma.preSave.count({ where: { releaseId, platform: "spotify", status: "pending" } });
    if (orphaned) out.notes.push(`${orphaned} Spotify pre-saves pending but org has no Spotify app connected`);
  }

  // --- Deezer (feature-flagged) ---
  if (deezerGloballyEnabled() && release.organization.deezerEnabled && !stop()) {
    const albumId = parseDeezerAlbumId(release.platformLinks.find((l) => l.platform === "deezer")?.url);
    if (albumId) {
      const rows = await prisma.preSave.findMany({ where: { releaseId, platform: "deezer", status: "pending" }, take: 1000 });
      await pool(rows, 20, async (ps) => {
        try {
          await deezerSaveAlbum(decrypt(ps.refreshTokenEncrypted!), albumId);
          await prisma.preSave.update({ where: { id: ps.id }, data: { status: "completed", completedAt: new Date() } });
          out.deezerDone++;
        } catch (e) {
          await prisma.preSave.update({ where: { id: ps.id }, data: { status: "failed", lastError: String(e).slice(0, 500), attempts: { increment: 1 } } });
        }
      }, stop);
    } else out.notes.push("Deezer album link not resolved yet");
  }

  // --- Release-day emails (every consenting email, regardless of platform) ---
  if (!emailConfigured()) {
    out.notes.push("RESEND not configured — emails skipped");
  } else {
    const org = release.organization;
    const origin = org.customDomain ? `https://${org.customDomain}` : SITE_URL;
    const publicUrl = org.customDomain ? `${origin}/${release.slug}` : `${SITE_URL}/${org.slug}/${release.slug}`;
    const platforms = release.platformLinks.map((l) => l.platform).filter((p) => p !== "custom");
    const topPlatforms = platforms.length ? platforms : ["spotify"];

    for (;;) {
      if (Date.now() > deadlineMs) break;
      const rows = await prisma.preSave.findMany({
        where: { releaseId, email: { not: null }, emailConsent: true, emailSentAt: null, status: { not: "unsubscribed" } },
        take: 100,
        orderBy: { createdAt: "asc" },
      });
      if (!rows.length) break;

      // One email per address per release, even if they pre-saved on two platforms.
      const seen = new Set<string>();
      const unique = rows.filter((r) => {
        const k = r.email!.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const messages = await Promise.all(
        unique.map(async (r) => {
          const tpl = await releaseDayEmail({
            preSaveId: r.id, releaseId, title: release.title, artistName: release.artistName, coverUrl: release.coverUrl,
            accentColor: release.accentColor, publicUrl, linkBase: origin, platforms: topPlatforms, orgName: org.emailFromName || org.name,
          });
          return { to: r.email!, fromName: org.emailFromName || org.name, replyTo: org.emailReplyTo, ...tpl };
        }),
      );
      try {
        await sendBatch(messages);
      } catch (e) {
        const retry = (e as { retryAfter?: number }).retryAfter;
        if (retry) {
          await sleep(retry * 1000);
          continue;
        }
        out.notes.push(`email batch failed: ${String(e).slice(0, 200)}`);
        break;
      }
      const now = new Date();
      await prisma.preSave.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { emailSentAt: now },
      });
      // email-only rows move to "emailed"; spotify rows keep their own completed/failed status
      await prisma.preSave.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, platform: "email", status: "pending" },
        data: { status: "emailed" },
      });
      out.emailed += unique.length;
      await sleep(600); // stay under Resend's default 2 req/s
    }
    const remaining = await prisma.preSave.count({ where: { releaseId, email: { not: null }, emailConsent: true, emailSentAt: null, status: { not: "unsubscribed" } } });
    if (!remaining) await prisma.release.update({ where: { id: releaseId }, data: { emailsSentAt: release.emailsSentAt ?? new Date() } });
  }

  out.stoppedEarly = stop();
  return out;
}

/** Hourly: which releases need work? */
export async function findDueReleases() {
  const now = new Date();
  const releases = await prisma.release.findMany({
    where: {
      releaseDate: { lte: now },
      OR: [
        { status: "upcoming" },
        { preSaves: { some: { status: "pending", platform: { in: ["spotify", "deezer"] }, attempts: { lt: 5 } } } },
        { preSaves: { some: { emailConsent: true, emailSentAt: null, email: { not: null }, status: { not: "unsubscribed" } } } },
      ],
    },
    select: { id: true, slug: true },
    take: 200,
  });
  return releases;
}

export { platformMeta };
