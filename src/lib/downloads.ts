import { signToken, verifyToken } from "./crypto";
// Re-exported so server code has one import for the whole feature; the client imports
// lib/gate-steps directly, which is free of anything that can't run in a browser.
export * from "./gate-steps";
import { PLAN_LIMITS, planOf, releaseWindowStart, type PlanKey } from "./plans";
import { prisma } from "./db";

/**
 * Download gates: a free file released behind actions a fan takes first.
 *
 * The honesty rule this file exists to enforce: **a step may only claim to be verified if
 * droplr can actually prove it.** Every competitor lists Instagram and TikTok follow gates
 * beside SoundCloud ones as if they were the same thing. They are not, and an artist choosing
 * where to put their fan list deserves to be told which is which.
 */

/**
 * Plan cap. Downloads count separately from releases — a gate is not a record going to stores,
 * and letting one eat the other's allowance would mean an artist on Free giving up a release to
 * post a remix pack.
 */
export async function downloadsUsed(organizationId: string) {
  return prisma.release.count({
    where: { organizationId, kind: "download", createdAt: { gte: releaseWindowStart() } },
  });
}

export async function downloadLimitReached(organizationId: string, plan: string) {
  const cap = planOf(plan).downloads;
  if (!Number.isFinite(cap)) return false;
  return (await downloadsUsed(organizationId)) >= cap;
}

export function downloadLimitMessage(plan: string) {
  const p = planOf(plan);
  return `${p.name} allows ${p.downloads} download gate${p.downloads === 1 ? "" : "s"} in any 12 months. Upgrade to add more; the ones you have stay live.`;
}

/** Plans that offer gates at all — every one of them. Free is capped, not excluded: a gate is
 *  how a new account first gets an email address, which is the thing that makes droplr worth
 *  paying for later. */
export const PLANS_WITH_DOWNLOADS: PlanKey[] = Object.keys(PLAN_LIMITS) as PlanKey[];

/**
 * The unlock token.
 *
 * Scoped to one release on its own audience, and short-lived. The destination URL is never put
 * in the gate page's HTML — it is handed out only by the unlock route, in exchange for a token
 * this function issued. Most gates leak because the real link sits in the page source behind a
 * hidden div, and View Source walks straight past the gate.
 */
const UNLOCK_TTL = "30m";

export const signUnlock = (releaseId: string, unlockId: string) =>
  signToken({ rid: releaseId, uid: unlockId }, UNLOCK_TTL, "dl");

export async function verifyUnlock(token: string | null | undefined, releaseId: string) {
  const payload = await verifyToken<{ rid?: string; uid?: string }>(token, "dl");
  if (!payload?.rid || payload.rid !== releaseId) return null;
  return payload.uid ?? null;
}

/**
 * Only http(s), and never a droplr host — a destination pointing back at droplr is either a
 * mistake or an attempt to bounce someone through the gate into an unrelated page.
 */
export function downloadUrlProblem(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return "That doesn't look like a link. Paste the full URL, starting with https://";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "Links have to start with https://";
  if (/(^|\.)droplr\.fm$/i.test(u.hostname)) return "Point this at where the file actually lives — Drive, Dropbox, your own host.";
  return null;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export type GateStepRow = {
  id: string;
  platform: string;
  action: string;
  target: string | null;
  targetId: string | null;
  required: boolean;
  position: number;
};

/**
 * Record one completed step against this visitor's progress row, and say whether that finishes
 * the gate.
 *
 * Deliberately server-side and keyed on the anonymous id the middleware already sets: a
 * SoundCloud step sends the fan off to soundcloud.com and back, so progress can't live anywhere
 * the fan could edit — a "performed" step that a fan can grant themselves is not performed.
 *
 * Steps are recorded by platform rather than by step id so that re-ordering a gate afterwards
 * doesn't strand someone half-way through.
 */
export async function completeStep(opts: {
  releaseId: string;
  anonId: string;
  platform: string;
  email?: string | null;
  country?: string | null;
  timezone?: string | null;
}) {
  const { releaseId, anonId, platform } = opts;
  const existing = await prisma.gateUnlock.findUnique({ where: { releaseId_anonId: { releaseId, anonId } } });
  const via = Array.from(new Set([...(existing?.via ?? []), platform]));

  const row = await prisma.gateUnlock.upsert({
    where: { releaseId_anonId: { releaseId, anonId } },
    create: {
      releaseId, anonId, via,
      email: opts.email ?? null,
      country: opts.country ?? null,
      timezone: opts.timezone ?? null,
    },
    update: { via, ...(opts.email ? { email: opts.email } : {}) },
  });

  const steps = await prisma.gateStep.findMany({ where: { releaseId }, orderBy: { position: "asc" } });
  const done = remaining(steps, row.via).length === 0;
  if (done && !row.completedAt) {
    return prisma.gateUnlock.update({ where: { id: row.id }, data: { completedAt: new Date() } });
  }
  return row;
}

/** Required steps this visitor still hasn't done. An empty gate is an open door, by design. */
export function remaining(steps: GateStepRow[] | { platform: string; required: boolean }[], via: string[]) {
  return steps.filter((s) => s.required && !via.includes(s.platform));
}

export async function progressFor(releaseId: string, anonId: string | null) {
  if (!anonId) return null;
  return prisma.gateUnlock.findUnique({ where: { releaseId_anonId: { releaseId, anonId } } });
}
