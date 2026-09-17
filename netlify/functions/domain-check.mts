import type { Config } from "@netlify/functions";
import { runDomainChecks } from "../../src/lib/domains";

// Every 15 minutes: remove aliases for changed domains, move pending custom domains along
// (TXT found → alias added → HTTPS reachable), re-check live ones every 6 hours. Scheduled functions stop at 30s.
export default async () => {
  const out = await runDomainChecks(Date.now() + 22_000);
  console.log("[domain-check]", out);
  return new Response(JSON.stringify(out), { status: 200 });
};

export const config: Config = { schedule: "*/15 * * * *" };
