import type { Config } from "@netlify/functions";
import { findDueReleases } from "../../src/lib/presave-processor";

// Every 15 minutes: find releases with work due somewhere in the world (store scans before/after release,
// Spotify saves at each fan's local release moment, release-day emails at the label's hour in each fan's timezone)
// and hand them to the 15-minute background function.
export default async () => {
  const due = await findDueReleases();
  if (!due.length) return new Response(JSON.stringify({ due: 0 }), { status: 200 });

  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL;
  const res = await fetch(`${base}/.netlify/functions/process-presaves-background`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": process.env.CRON_SECRET ?? "" },
    body: JSON.stringify({ releaseIds: due.map((r) => r.id) }),
  });
  console.log(`[release-check] enqueued ${due.length} releases → background ${res.status}`);
  return new Response(JSON.stringify({ due: due.length, background: res.status }), { status: 200 });
};

export const config: Config = { schedule: "*/15 * * * *" };
