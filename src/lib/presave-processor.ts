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
import { linkCustomDomain } from "./plans";
import { isReleased, isValidTimeZone, releaseEmailDueFor, releaseInstantFor, releaseWindow } from "./time";
import { tidalConfigured } from "./odesli";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** A fan who picked a store with no link yet waits this long past their send time for the link to turn up. */
const LISTEN_ON_WAIT_MS = 6 * HOUR;

export type ProcessResult = { releaseId: string; resolvedLinks: number; spotifyDone: number; spotifyFailed: number; deezerDone: number; emailed: number; stoppedEarly: boolean; notes: string[] };

type AutoKey = "appleMusic" | "deezer" | "spotify" | "tidal";
const AUTO_LABEL: Record<AutoKey, string> = { appleMusic: "Apple Music", deezer: "Deezer", spotify: "Spotify", tidal: "TIDAL" };

/**
 * Step 1: fill store links from UPC/ISRC: Apple Music (iTunes Lookup), Deezer, Spotify (label's app), TIDAL (env keys).
 * - Only creates a link when there's no row for that platform at all. A hidden row means the
 *   label hid it on purpose, and an existing visible row is left untouched.
 * - If the release has no UPC/ISRC yet, asks Spotify for external_ids first.
 * - New rows go to the end of the list so the label's order (Beatport up top etc.) is kept.
 * Runs daily in the fortnight before release (pre-orders often show up early) and hourly after it unlocks.
 */
export async function reResolveRelease(releaseId: string, log: (msg: string) => void = console.log) {
  const release = await prisma.release.findUnique({ where: { id: releaseId }, include: { links: true } });
  if (!release) return 0;
  const creds = await getSpotifyCreds(release.organizationId).catch(() => null);

  let upc = normaliseUpc(release.upc);
  let isrc = normaliseIsrc(release.isrc);
  if (!upc && !isrc && (release.spotifyAlbumId || release.spotifyTrackId)) {
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

  const auto: AutoKey[] = ["appleMusic", "deezer", ...(creds || release.spotifyAlbumId || release.spotifyTrackId ? (["spotify"] as const) : []), ...(tidalConfigured() ? (["tidal"] as const) : [])];
  let missing = auto.filter((k) => !release.links.some((l) => l.platform === k));
  let position = release.links.reduce((m, l) => Math.max(m, l.position), -1) + 1;
  let added = 0;
  const now = new Date();

  // Spotify straight from the IDs the label already gave us: no lookup needed.
  if (missing.includes("spotify") && (release.spotifyAlbumId || release.spotifyTrackId)) {
    const url = release.spotifyAlbumId ? `https://open.spotify.com/album/${release.spotifyAlbumId}` : `https://open.spotify.com/track/${release.spotifyTrackId}`;
    await prisma.releaseLink.create({ data: { releaseId, platform: "spotify", url, visible: true, position: position++ } });
    log("Added Spotify from the release's Spotify ID");
    added++;
    missing = missing.filter((k) => k !== "spotify");
  }

  if (!missing.length || (!upc && !isrc)) {
    await prisma.release.update({ where: { id: releaseId }, data: { linksCheckedAt: now, ...(!missing.length && !release.resolvedAt ? { resolvedAt: now } : {}) } });
    return added;
  }

  const found = await resolveStores({ upc, isrc }, { spotifyCreds: creds, want: missing });
  for (const k of missing) {
    const url = found[k];
    if (!url) continue;
    await prisma.releaseLink.create({ data: { releaseId, platform: k, url, visible: true, position: position++ } });
    log(`Auto-resolved ${AUTO_LABEL[k]} via ${found.via[k]}`);
    added++;
  }

  const stillMissing = missing.filter((k) => !found[k]).length;
  await prisma.release.update({
    where: { id: releaseId },
    data: {
      linksCheckedAt: now,
      resolvedAt: stillMissing ? release.resolvedAt : now,
      coverUrl: release.coverUrl || found.artwork || release.coverUrl,
    },
  });
  return added;
}

/** Group pending rows by fan timezone and return the zones whose moment has come. null zone = the label's timezone. */
async function dueZones(where: Record<string, unknown>, dueAt: (tz: string | null) => Date, extraMs = 0) {
  const groups = await prisma.preSave.groupBy({ by: ["timezone"], where: where as never });
  const now = Date.now();
  return groups.map((g) => g.timezone).filter((tz) => dueAt(isValidTimeZone(tz) ? tz : null).getTime() + extraMs <= now);
}

function inZones(zones: (string | null)[]) {
  const named = zones.filter((z): z is string => !!z);
  return { OR: [...(zones.includes(null) ? [{ timezone: null }] : []), ...(named.length ? [{ timezone: { in: named } }] : [])] };
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
  // Take the lease (expires on its own if a run dies) so an overlapping run can't send the same emails twice.
  const leaseUntil = new Date(Math.max(deadlineMs, Date.now()) + 2 * MIN);
  const leased = await prisma.release.updateMany({
    where: { id: releaseId, OR: [{ processingUntil: null }, { processingUntil: { lt: new Date() } }] },
    data: { processingUntil: leaseUntil },
  });
  if (leased.count !== 1) {
    out.notes.push("already being processed by another run");
    return out;
  }
  try {
    return await processReleaseLeased(releaseId, deadlineMs, out);
  } finally {
    await prisma.release.updateMany({ where: { id: releaseId, processingUntil: leaseUntil }, data: { processingUntil: null } }).catch(() => {});
  }
}

async function processReleaseLeased(releaseId: string, deadlineMs: number, out: ProcessResult): Promise<ProcessResult> {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: { organization: true, links: { where: { visible: true }, orderBy: { position: "asc" } } },
  });
  if (!release) return out;
  const orgTz = release.organization.timezone;
  const now = Date.now();
  const win = releaseWindow(release, orgTz);
  const started = now >= win.earliest.getTime();
  const orgLive = isReleased(release.releaseDate);
  const scanStale = (ms: number) => !release.linksCheckedAt || now - release.linksCheckedAt.getTime() > ms;

  // Store links: daily in the fortnight before, on the flip to live, then hourly until 72h after it's out everywhere.
  const scan =
    release.autoReResolve &&
    ((orgLive && release.status !== "live") ||
      (!release.resolvedAt &&
        (started ? now < win.latest.getTime() + 72 * HOUR && scanStale(50 * MIN) : release.releaseDate.getTime() - now < 14 * DAY && scanStale(20 * HOUR))));
  if (scan) {
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
  if (!started) {
    out.notes.push("not out anywhere yet");
    return out;
  }
  if (orgLive && release.status !== "live") {
    await prisma.release.update({ where: { id: releaseId }, data: { status: "live" } });
  }

  let quotaStop = false;
  const stop = () => quotaStop || Date.now() > deadlineMs;

  // --- Spotify true saves (only rows created via a BYO app OAuth) ---
  const creds = await getSpotifyCreds(release.organizationId);
  if (creds) {
    // Each fan's library save waits for the release to unlock in their own timezone.
    const spotifyWhere = { releaseId, platform: "spotify", status: "pending", refreshTokenEncrypted: { not: null }, attempts: { lt: 5 } };
    const spotifyZones = await dueZones(spotifyWhere, (tz) => releaseInstantFor(release, orgTz, tz ?? orgTz));
    for (;;) {
      if (stop() || !spotifyZones.length) break;
      const batch = await prisma.preSave.findMany({
        where: { ...spotifyWhere, ...inZones(spotifyZones) },
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
    const domain = linkCustomDomain(org);
    const origin = domain ? `https://${domain}` : SITE_URL;
    const publicUrl = domain ? `${origin}/${release.slug}` : `${SITE_URL}/${org.slug}/${release.slug}`;
    const platforms = [...new Set(release.links.map((l) => l.platform).filter((p) => p !== "custom"))];
    const topPlatforms = platforms.length ? platforms : ["spotify"];
    const hour = org.releaseEmailHour;
    const emailWhere = { releaseId, email: { not: null }, emailConsent: true, emailSentAt: null, status: { not: "unsubscribed" } };
    // 9am (or the label's hour) in each fan's timezone on the day it unlocks for them.
    const emailDue = (tz: string | null) => releaseEmailDueFor(release, orgTz, tz, hour);
    const zonesDue = await dueZones(emailWhere, emailDue);
    const zonesPastWait = await dueZones(emailWhere, emailDue, LISTEN_ON_WAIT_MS);
    // Fans who picked a store with no link yet wait (up to LISTEN_ON_WAIT_MS) for it to be found; everyone else goes now.
    const readyWhere = {
      ...emailWhere,
      OR: [
        ...(zonesDue.length ? [{ AND: [inZones(zonesDue), { OR: [{ listenOn: null }, { listenOn: { in: platforms } }] }] }] : []),
        ...(zonesPastWait.length ? [inZones(zonesPastWait)] : []),
      ],
    };
    const orderFor = (listenOn: string | null) => (listenOn && platforms.includes(listenOn) ? [listenOn, ...topPlatforms.filter((p) => p !== listenOn)] : topPlatforms);

    for (;;) {
      if (Date.now() > deadlineMs || !readyWhere.OR.length) break;
      let rows = await prisma.preSave.findMany({
        where: readyWhere,
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
            accentColor: release.accentColor, publicUrl, linkBase: origin, platforms: orderFor(r.listenOn), orgName: org.emailFromName || org.name,
          });
          return { to: r.email!, fromName: org.emailFromName || org.name, replyTo: org.emailReplyTo, ...tpl };
        }),
      );
      // Rows Resend refused individually (bad address etc.): stamped so they don't block everyone else every hour.
      const rejected = new Map<string, string>();
      const unsent = new Set<string>();
      try {
        await sendBatch(messages);
      } catch (e) {
        const { retryAfter, status } = e as { retryAfter?: number; status?: number };
        if (retryAfter) {
          await sleep(retryAfter * 1000);
          continue;
        }
        if (!status || status >= 500 || status === 401 || status === 403) {
          // Resend down or misconfigured: leave everything pending for the next hourly run.
          out.notes.push(`email batch failed: ${String(e).slice(0, 200)}`);
          break;
        }
        // One invalid message fails the whole batch: send one by one so the rest still go out.
        for (const m of messages) {
          const key = m.to.toLowerCase();
          if (Date.now() > deadlineMs) { unsent.add(key); continue; }
          if (unsent.size) { unsent.add(key); continue; } // Resend went down mid-way: the rest wait for the next run
          try {
            await sendBatch([m]);
          } catch (single) {
            const s = single as { retryAfter?: number; status?: number };
            if (s.status && s.status < 500 && s.status !== 429 && s.status !== 401 && s.status !== 403) rejected.set(key, String(single).slice(0, 300));
            else unsent.add(key);
          }
          await sleep(600);
        }
        if (rejected.size) out.notes.push(`${rejected.size} release-day email(s) rejected by Resend`);
        if (unsent.size) out.notes.push(`${unsent.size} release-day email(s) left for the next run`);
      }
      const now = new Date();
      rows = rows.filter((r) => !unsent.has(r.email!.toLowerCase()));
      await prisma.preSave.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { emailSentAt: now },
      });
      // Same address pre-saved twice (e.g. email + Spotify, different browser timezone): that one email covers both.
      await prisma.preSave.updateMany({
        where: { releaseId, emailSentAt: null, email: { in: [...new Set(rows.map((r) => r.email!))] } },
        data: { emailSentAt: now },
      });
      for (const r of rows.filter((x) => rejected.has(x.email!.toLowerCase()))) {
        await prisma.preSave.update({ where: { id: r.id }, data: { lastError: `release-day email rejected: ${rejected.get(r.email!.toLowerCase())}` } });
      }
      // email-only rows move to "emailed"; spotify rows keep their own completed/failed status
      await prisma.preSave.updateMany({
        where: { id: { in: rows.filter((r) => !rejected.has(r.email!.toLowerCase())).map((r) => r.id) }, platform: "email", status: "pending" },
        data: { status: "emailed" },
      });
      out.emailed += unique.length - rejected.size - unsent.size;
      if (unsent.size) break;
      await sleep(600); // stay under Resend's default 2 req/s
    }
    const remaining = await prisma.preSave.count({ where: { releaseId, email: { not: null }, emailConsent: true, emailSentAt: null, status: { not: "unsubscribed" } } });
    if (!remaining) await prisma.release.update({ where: { id: releaseId }, data: { emailsSentAt: release.emailsSentAt ?? new Date() } });
  }

  out.stoppedEarly = stop();
  return out;
}

/** Every 15 minutes: which releases need work (store scans, saves or emails due somewhere in the world)? */
export async function findDueReleases() {
  const now = Date.now();
  const select = { id: true, slug: true, releaseDate: true, rollout: true, status: true, autoReResolve: true, resolvedAt: true, linksCheckedAt: true, organization: { select: { timezone: true } } } as const;
  const [work, scans] = await Promise.all([
    // Unlocks can start up to 26h before the label's own moment (UTC+14 fan, UTC−12 label).
    prisma.release.findMany({
      where: {
        releaseDate: { lte: new Date(now + 26 * HOUR) },
        OR: [
          { status: "upcoming" },
          { preSaves: { some: { status: "pending", platform: { in: ["spotify", "deezer"] }, attempts: { lt: 5 } } } },
          { preSaves: { some: { emailConsent: true, emailSentAt: null, email: { not: null }, status: { not: "unsubscribed" } } } },
        ],
      },
      select,
      take: 300,
    }),
    prisma.release.findMany({
      where: { autoReResolve: true, resolvedAt: null, releaseDate: { gte: new Date(now - 5 * DAY), lte: new Date(now + 14 * DAY) } },
      select,
      take: 300,
    }),
  ]);
  const due = new Map<string, { id: string; slug: string }>();
  for (const r of work) if (now >= releaseWindow(r, r.organization.timezone).earliest.getTime()) due.set(r.id, { id: r.id, slug: r.slug });
  for (const r of scans) {
    const win = releaseWindow(r, r.organization.timezone);
    const stale = (ms: number) => !r.linksCheckedAt || now - r.linksCheckedAt.getTime() > ms;
    const started = now >= win.earliest.getTime();
    if (started ? now < win.latest.getTime() + 72 * HOUR && stale(50 * MIN) : stale(20 * HOUR)) due.set(r.id, { id: r.id, slug: r.slug });
  }
  return [...due.values()].slice(0, 200);
}

export { platformMeta };
