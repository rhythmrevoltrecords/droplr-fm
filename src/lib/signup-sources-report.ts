import { prisma } from "./db";
import { internalSlugs } from "./platform-stats";
import { sourceFromHost } from "./referrer-source";

/**
 * Sign-ups by where they came from, for judging a channel: an ad, a sponsorship, an outreach batch,
 * the YouTube channel. The column that decides a channel is "made a release", not sign-ups: a
 * sign-up who never makes a page cost the same and is worth nothing.
 *
 * Customers only. droplr's own accounts (PLATFORM_INTERNAL_ORG_SLUGS) are left out and named.
 */

export const UNKNOWN = "Direct or unknown";
export const PERIODS = { "30": 30, "90": 90, all: null } as const;
export type Period = keyof typeof PERIODS;
export const isPeriod = (v: unknown): v is Period => typeof v === "string" && v in PERIODS;

/** What a row is reported under: the utm_source if the link was tagged, else the referring site. */
export function sourceLabel(s: { source: string | null; referrerHost: string | null } | null): string {
  if (!s) return UNKNOWN;
  if (s.source) return s.source;
  return s.referrerHost ? sourceFromHost(s.referrerHost) : UNKNOWN;
}

export type SourceRow = {
  source: string;
  medium: string | null;
  campaign: string | null;
  signups: number;
  confirmed: number;
  madeRelease: number;
  paying: number;
  referred: number;
};

export type RecentSignup = {
  name: string;
  slug: string;
  kind: string;
  createdAt: Date;
  source: string;
  medium: string | null;
  campaign: string | null;
  referrerHost: string | null;
  landingPath: string | null;
  madeRelease: boolean;
  paying: boolean;
};

export type SourcesReport = { rows: SourceRow[]; recent: RecentSignup[]; total: number; unknown: number; excluded: string[]; since: Date | null };

export async function signupSourcesReport(period: Period, now = new Date()): Promise<SourcesReport> {
  const days = PERIODS[period];
  const since = days ? new Date(now.getTime() - days * 86_400_000) : null;
  const excluded = internalSlugs();
  const orgs = await prisma.organization.findMany({
    where: { ...(since ? { createdAt: { gte: since } } : {}), ...(excluded.length ? { slug: { notIn: excluded } } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      name: true, slug: true, kind: true, plan: true, stripeSubscriptionId: true, createdAt: true,
      signupSource: { select: { source: true, medium: true, campaign: true, referrerHost: true, landingPath: true } },
      referredBy: { select: { id: true } },
      users: { where: { role: "owner" }, select: { emailVerifiedAt: true } },
      _count: { select: { releases: { where: { kind: "release" } } } },
    },
  });

  const groups = new Map<string, SourceRow>();
  const recent: RecentSignup[] = [];
  for (const o of orgs) {
    const s = o.signupSource;
    const source = sourceLabel(s);
    const medium = s?.source ? s.medium : null;
    const campaign = s?.source ? s.campaign : null;
    const key = JSON.stringify([source, medium, campaign]);
    const row = groups.get(key) ?? { source, medium, campaign, signups: 0, confirmed: 0, madeRelease: 0, paying: 0, referred: 0 };
    const madeRelease = o._count.releases > 0;
    const paying = !!o.stripeSubscriptionId && o.plan !== "free";
    row.signups++;
    if (o.users.some((u) => u.emailVerifiedAt)) row.confirmed++;
    if (madeRelease) row.madeRelease++;
    if (paying) row.paying++;
    if (o.referredBy) row.referred++;
    groups.set(key, row);
    if (recent.length < 50) recent.push({ name: o.name, slug: o.slug, kind: o.kind, createdAt: o.createdAt, source, medium, campaign, referrerHost: s?.referrerHost ?? null, landingPath: s?.landingPath ?? null, madeRelease, paying });
  }
  // Most sign-ups first; "Direct or unknown" always last, so the channels you can act on lead.
  const rows = [...groups.values()].sort((a, b) => Number(a.source === UNKNOWN) - Number(b.source === UNKNOWN) || b.signups - a.signups || a.source.localeCompare(b.source));
  return { rows, recent, total: orgs.length, unknown: groups.get(JSON.stringify([UNKNOWN, null, null]))?.signups ?? 0, excluded, since };
}
