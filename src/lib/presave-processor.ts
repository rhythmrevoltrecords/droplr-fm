// Shared by Netlify functions (release-check, process-presaves-background) and the manual cron API route.
// Relative imports only — this file is bundled by Netlify's esbuild outside Next.
import { prisma } from "./db";
import { decrypt, encrypt } from "./crypto";
import { SITE_URL, deezerGloballyEnabled } from "./env";
import { normaliseIsrc, normaliseUpc, resolveFromSpotifyUri, resolveStores } from "./odesli";
import { platformMeta } from "./platforms";
import { getSpotifyCreds, refreshAccessToken, saveToLibrary, SpotifyError } from "./spotify";
import { deezerSaveAlbum, parseDeezerAlbumId } from "./deezer";
import { emailConfigured, releaseDayEmail, sendBatch } from "./email";
import { activeCustomDomain } from "./plans";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ProcessResult = { releaseId: string; resolvedLinks: number; spotifyDone: number; spotifyFailed: number; deezerDone: number; emailed: number; stoppedEarly: boolean; notes: string[] };

const AUTO_PLATFORMS = [
  { key: "appleMusic", label: "Apple" },
  { key: "deezer", label: "Deezer" },
] as const;

/**
 * Step 1: fill Apple Music + Deezer links from UPC/ISRC (iTunes Lookup + Deezer API).
 * - Only creates a link when there's no row for that platform at all. A hidden row means the
 *   label hid it on purpose, and an existing visible row is left untouched.
 * - If the release has no UPC/ISRC yet, asks Spotify for external_ids first.
 * - New rows go to the end of the list so the label's order (Beatport up top etc.) is kept.
 */
export async function reResolveRelease(releaseId: string, log: (msg: string) => void = console.log) {
  const release = await prisma.release.findUnique({ where: { id: releaseId }, include: { links: true } });
  if (!release) return 0;

  let upc = normaliseUpc(release.upc);
  let isrc = normaliseIsrc(release.isrc);
  if (!upc && !isrc && (release.spotifyAlbumId || release.spotifyTrackId)) {
    const creds = await getSpotifyCreds(release.organizationId).catch(() => null);
    const meta = await resolveFromSpotifyUri(
      release.spotifyAlbumId ? { type: "album", id: release.spotifyAlbumId } : { type: "track", id: release.spotifyTrackId! },
      creds,
    );
    upc = normaliseUpc(meta?.upc);
    isrc = normaliseIsrc(meta?.isrc);
    if (upc || isrc) {
      await prisma.release.update({ where: { id: releaseId }, data: { upc: release.upc ?? upc, isrc: release.isrc ?? isrc } });
      log(`[resolve] ${release.slug}: got ${upc ? `UPC ${upc}` : `ISRC ${isrc}`} from Spotify`);
    }
  }
  if (!upc && !isrc) return 0;

  const missing = AUTO_PLATFORMS.filter((p) => !release.links.some((l) => l.platform === p.key));
  if (!missing.length) {
    if (!release.resolvedAt) await prisma.release.update({ where: { id: releaseId }, data: { resolvedAt: new Date() } });
    return 0;
  }

  const found = await resolveStores({ upc, isrc });
  let position = release.links.reduce((m, l) => Math.max(m, l.position), -1) + 1;
  let added = 0;
  for (const p of missing) {
    const url = found[p.key];
    if (!url) continue;
    await prisma.releaseLink.create({ data: { releaseId, platform: p.key, url, visible: true, position: position++ } });
    log(`Auto-resolved ${p.label} via ${found.via[p.key]}`);
    added++;
  }

  const stillMissing = missing.filter((p) => !found[p.key]).length;
  await prisma.release.update({
    where: { id: releaseId },
    data: {
      resolvedAt: stillMissing ? release.resolvedAt : new Date(),
      coverUrl: release.coverUrl || found.artwork || release.coverUrl,
    },
  });
  return added;
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
    include: { organization: true, links: { where: { visible: true }, orderBy: { position: "asc" } } },
  });
  if (!release) return out;
  if (release.releaseDate.getTime() > Date.now()) {
    out.notes.push("not released yet");
    return out;
  }

  // Apple Music / Deezer from UPC/ISRC: on the flip to live, then hourly for 72h until both are found
  // (stores often publish a few hours after midnight).
  const retryWindow = Date.now() - release.releaseDate.getTime() < 72 * 3600_000;
  if (release.autoReResolve && (release.status !== "live" || (!release.resolvedAt && retryWindow))) {
    out.resolvedLinks = await reResolveRelease(releaseId, (m) => {
      console.log(`[process-presaves] ${release.slug}: ${m}`);
      out.notes.push(m);
    }).catch((e) => {
      out.notes.push(`store lookup failed: ${e}`);
      return 0;
    });
    if (out.resolvedLinks) {
      release.links = await prisma.releaseLink.findMany({ where: { releaseId, visible: true }, orderBy: { position: "asc" } });
    }
  }
  if (release.status !== "live") {
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
    const albumId = parseDeezerAlbumId(release.links.find((l) => l.platform === "deezer")?.url);
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
    const domain = activeCustomDomain(org);
    const origin = domain ? `https://${domain}` : SITE_URL;
    const publicUrl = domain ? `${origin}/${release.slug}` : `${SITE_URL}/${org.slug}/${release.slug}`;
    const platforms = [...new Set(release.links.map((l) => l.platform).filter((p) => p !== "custom"))];
    const topPlatforms = platforms.length ? platforms : ["spotify"];

    for (;;) {
      if (Date.now() > deadlineMs) break;
      let rows = await prisma.preSave.findMany({
        where: { releaseId, email: { not: null }, emailConsent: true, emailSentAt: null, status: { not: "unsubscribed" } },
        take: 100,
        orderBy: { createdAt: "asc" },
      });
      if (!rows.length) break;

      // Unsubscribing from any release of this label covers all of its releases, including rows that
      // were (re)consented later, e.g. via a Spotify pre-save. Mark those so they never loop again.
      const optedOut = await prisma.preSave.findMany({
        where: { email: { in: [...new Set(rows.map((r) => r.email!))] }, status: "unsubscribed", release: { organizationId: release.organizationId } },
        select: { email: true },
        distinct: ["email"],
      });
      const optedOutSet = new Set(optedOut.map((r) => r.email!.toLowerCase()));
      const blocked = rows.filter((r) => optedOutSet.has(r.email!.toLowerCase()));
      if (blocked.length) {
        const ids = blocked.map((r) => r.id);
        const stamp = new Date();
        await prisma.preSave.updateMany({ where: { id: { in: ids } }, data: { emailConsent: false, emailSentAt: stamp } });
        await prisma.preSave.updateMany({ where: { id: { in: ids }, platform: "email" }, data: { status: "unsubscribed" } });
        rows = rows.filter((r) => !optedOutSet.has(r.email!.toLowerCase()));
        if (!rows.length) continue;
      }

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
        // store-link retry window: live < 72h, auto re-resolve on, Apple/Deezer not both found yet
        { autoReResolve: true, resolvedAt: null, releaseDate: { gte: new Date(now.getTime() - 72 * 3600_000) } },
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
