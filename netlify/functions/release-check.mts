import type { Config } from "@netlify/functions";
import { findDueNewsEmails } from "../../src/lib/news";
import { findDueReleases } from "../../src/lib/presave-processor";
import { notifyLiveReleases } from "../../src/lib/push-live";

// Every 15 minutes: find releases with work due somewhere in the world (store scans before/after release,
// Spotify saves at each fan's local release moment, release-day emails at the label's hour in each fan's timezone)
// and hand them to the 15-minute background function.
export default async () => {
  // Push "X is out" to each team once its release moment passes (cheap: an indexed query + claim).
  await notifyLiveReleases().catch((e) => console.error("[release-check] live push", e));
  const [due, news] = await Promise.all([findDueReleases(), findDueNewsEmails()]);
  if (!due.length && !news.length) return new Response(JSON.stringify({ due: 0, news: 0 }), { status: 200 });

  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL;
  const res = await fetch(`${base}/.netlify/functions/process-presaves-background`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": process.env.CRON_SECRET ?? "" },
    body: JSON.stringify({ releaseIds: due.map((r) => r.id), newsEmailIds: news.map((n) => n.id) }),
  });
  console.log(`[release-check] enqueued ${due.length} releases + ${news.length} news emails → background ${res.status}`);
  return new Response(JSON.stringify({ due: due.length, news: news.length, background: res.status }), { status: 200 });
};

export const config: Config = { schedule: "*/15 * * * *" };
