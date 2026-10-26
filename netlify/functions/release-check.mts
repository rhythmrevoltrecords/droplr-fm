import type { Config } from "@netlify/functions";
import { sweepLapsedComps } from "../../src/lib/billing";
import { findDueNewsEmails } from "../../src/lib/news";
import { findDueReleases } from "../../src/lib/presave-processor";
import { notifyDuePromoSteps } from "../../src/lib/promo-reminders";
import { notifyLiveReleases } from "../../src/lib/push-live";
import { findDueEspConnections } from "../../src/lib/esp/db";
import { pruneThrottles } from "../../src/lib/throttle";
import { sealLegacyReportTokens } from "../../src/lib/report";
import { reencryptStale } from "../../src/lib/key-rotation";
import { hashLegacyWithdrawTokens } from "../../src/lib/contest-server";
import { confirmLegacyNewsTicks, sendQueuedConfirmations } from "../../src/lib/news-confirm";

// Every 15 minutes: find releases with work due somewhere in the world (store scans before/after release,
// Spotify saves at each fan's local release moment, release-day emails at the label's hour in each fan's timezone)
// and hand them to the 15-minute background function.
export default async () => {
  const started = Date.now();
  // Push "X is out" to each team once its release moment passes (cheap: an indexed query + claim).
  await notifyLiveReleases().catch((e) => console.error("[release-check] live push", e));
  // "This is due today" nudges for the promo plan. Claimed per step, so a 15-minute job never repeats one.
  await notifyDuePromoSteps().catch((e) => console.error("[release-check] promo push", e));
  // Complimentary plans that have lapsed drop back to what the account actually pays for.
  await sweepLapsedComps()
    .then((n) => n && console.info("[release-check] comps lapsed", n))
    .catch((e) => console.error("[release-check] comp sweep", e));
  const [due, news, esp] = await Promise.all([findDueReleases(), findDueNewsEmails(), findDueEspConnections()]);
  let background: number | null = null;
  if (due.length || news.length || esp.length) {
    const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL;
    const res = await fetch(`${base}/.netlify/functions/process-presaves-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": process.env.CRON_SECRET ?? "" },
      body: JSON.stringify({ releaseIds: due.map((r) => r.id), newsEmailIds: news.map((n) => n.id), espConnectionIds: esp }),
    });
    background = res.status;
    console.log(`[release-check] enqueued ${due.length} releases + ${news.length} news emails → background ${res.status}`);
  }

  // Housekeeping last, so release-day work is never the thing a slow sweep pushes past the
  // scheduled function's 30-second limit. The sweeps that loop take a deadline and pick up where
  // they are next run.
  const deadline = started + 20_000;
  // Rate-limit records are kept for a day at most (privacy policy), whatever the traffic.
  await pruneThrottles().catch((e) => console.error("[release-check] throttle prune", e));
  // Report links made before tokens were hashed: encrypt the leftover plaintext, then drop it.
  await sealLegacyReportTokens(deadline)
    .then((n) => n && console.info("[release-check] report tokens sealed", n))
    .catch((e) => console.error("[release-check] report seal", e));
  // Key rotation: anything not yet under the current ENCRYPTION_KEY. Logs only when there was work,
  // so "nothing left" is the first run with no line after a rotation.
  await reencryptStale(deadline)
    .then((r) => {
      if (r.reencrypted || r.unreadable || r.remaining) console.info("[release-check] re-encrypted", r);
      else if (process.env.ENCRYPTION_KEY_PREVIOUS) console.info("[release-check] key rotation done: nothing uses ENCRYPTION_KEY_PREVIOUS any more, it can be removed");
    })
    .catch((e) => console.error("[release-check] re-encrypt", e));
  await hashLegacyWithdrawTokens(deadline)
    .then((n) => n && console.info("[release-check] withdraw tokens hashed", n))
    .catch((e) => console.error("[release-check] withdraw hash", e));
  await confirmLegacyNewsTicks(deadline)
    .then((n) => n && console.info("[release-check] news ticks under the old wording confirmed", n))
    .catch((e) => console.error("[release-check] legacy news ticks", e));

  // Confirmation emails an account's daily ceiling held back: sent now if there is room.
  await sendQueuedConfirmations(deadline)
    .then((n) => n && console.info("[release-check] queued confirmations sent", n))
    .catch((e) => console.error("[release-check] confirmation queue", e));
  return new Response(JSON.stringify({ due: due.length, news: news.length, background }), { status: 200 });
};

export const config: Config = { schedule: "*/15 * * * *" };
