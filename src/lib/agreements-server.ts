import { prisma } from "./db";
import { hasBeta } from "./beta";
import { planOf } from "./plans";
import type { AgreementInput } from "./agreements";

/** Agreements are a label's record: label accounts on a plan with contracts. Gate on creating only. */
export function contractsAllowed(org: { kind: string | null; plan: string | null; betaFeatures?: string[] | null }) {
  if (!hasBeta(org, "agreements")) return { can: false as const, why: "beta" as const };
  if (org.kind === "artist") return { can: false as const, why: "artist" as const };
  if (!planOf(org.plan).contracts) return { can: false as const, why: "plan" as const };
  return { can: true as const, why: null };
}

/**
 * The artist and releases an agreement points at must be the caller's own. Checked here, against
 * the account, never trusted from the form: an id from another label must fail as "not yours"
 * without saying whether it exists.
 */
export async function ownedRefs(organizationId: string, f: Partial<AgreementInput>) {
  if (f.artistId) {
    const a = await prisma.artist.findFirst({ where: { id: f.artistId, organizationId }, select: { id: true } });
    if (!a) return "That artist isn't on your roster.";
  }
  if (f.releaseIds?.length) {
    // Releases going to stores only: a download gate has no deal behind it, and no page would show it.
    const n = await prisma.release.count({ where: { id: { in: f.releaseIds }, organizationId, kind: "release" } });
    if (n !== f.releaseIds.length) return "Those releases aren't yours.";
  }
  return null;
}

/** The fields a write sends to Prisma, from the parsed input. releaseIds is handled separately. */
export function agreementData(f: Partial<AgreementInput>) {
  const { releaseIds: _r, ...rest } = f;
  void _r;
  return rest;
}
