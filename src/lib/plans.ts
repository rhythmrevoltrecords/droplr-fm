export type PlanKey = "free" | "artist" | "artist_pro" | "pro" | "label" | "enterprise";
export type AccountKind = "label" | "artist";
export const isAccountKind = (k: unknown): k is AccountKind => k === "label" || k === "artist";

export const PLAN_LIMITS: Record<PlanKey, {
  name: string;
  /** Monthly AUD incl. tax. null = not self-serve (Enterprise: contact us). */
  price: number | null;
  /** Yearly AUD incl. tax (two months free). null = no yearly price. */
  yearly: number | null;
  /** New releases allowed in any rolling 12 months. Existing releases always stay live. */
  releases: number;
  /** Soft cap: shown as usage and an upgrade prompt. Fan links never stop working. */
  /**
   * Gated free downloads per rolling 12 months. Separate from `releases` on purpose: a download
   * gate is not a record going to stores, and sharing one allowance would mean an artist on Free
   * giving up a release to post a remix pack.
   */
  downloads: number;
  clicksPerMonth: number;
  artists: number;
  /** Days of analytics history you can view. */
  insightsDays: number;
  /** Release-day emails sent per release (the first N pre-savers, in order). Everyone still pre-saves. */
  releaseEmails: number;
  customDomain: boolean;
  pixels: boolean;
  byoSpotify: boolean;
  csvExport: boolean;
  qr: boolean;
  removeBranding: boolean;
  whiteLabel: boolean;
  /** Send one-off emails to fans who ticked the optional news box. Costs real sending credits. */
  newsEmails: boolean;
}> = {
  free: { name: "Free", price: 0, yearly: null, releases: 3, downloads: 2, clicksPerMonth: 1_000, artists: 1, insightsDays: 30, releaseEmails: 250, customDomain: false, pixels: false, byoSpotify: false, csvExport: false, qr: false, removeBranding: false, whiteLabel: false, newsEmails: false },
  artist: { name: "Artist", price: 12, yearly: 120, releases: 12, downloads: 12, clicksPerMonth: 10_000, artists: 1, insightsDays: 90, releaseEmails: Infinity, customDomain: false, pixels: true, byoSpotify: false, csvExport: true, qr: true, removeBranding: false, whiteLabel: false, newsEmails: true },
  artist_pro: { name: "Artist Pro", price: 25, yearly: 250, releases: Infinity, downloads: Infinity, clicksPerMonth: 50_000, artists: 1, insightsDays: Infinity, releaseEmails: Infinity, customDomain: true, pixels: true, byoSpotify: true, csvExport: true, qr: true, removeBranding: true, whiteLabel: false, newsEmails: true },
  pro: { name: "Pro", price: 29, yearly: 290, releases: Infinity, downloads: Infinity, clicksPerMonth: 50_000, artists: 5, insightsDays: Infinity, releaseEmails: Infinity, customDomain: true, pixels: true, byoSpotify: true, csvExport: true, qr: true, removeBranding: true, whiteLabel: false, newsEmails: true },
  label: { name: "Label", price: 79, yearly: 790, releases: Infinity, downloads: Infinity, clicksPerMonth: 250_000, artists: Infinity, insightsDays: Infinity, releaseEmails: Infinity, customDomain: true, pixels: true, byoSpotify: true, csvExport: true, qr: true, removeBranding: true, whiteLabel: true, newsEmails: true },
  enterprise: { name: "Enterprise", price: null, yearly: null, releases: Infinity, downloads: Infinity, clicksPerMonth: Infinity, artists: Infinity, insightsDays: Infinity, releaseEmails: Infinity, customDomain: true, pixels: true, byoSpotify: true, csvExport: true, qr: true, removeBranding: true, whiteLabel: true, newsEmails: true },
};

/** Start of the rolling 12-month window release limits count in. */
export const releaseWindowStart = (now = new Date()) => new Date(now.getTime() - 365 * 86_400_000);

export function planOf(plan: string | null | undefined) {
  return PLAN_LIMITS[(plan as PlanKey) in PLAN_LIMITS ? (plan as PlanKey) : "free"];
}

/** Rank order (higherPlan). Artist plans sit below the label plans (one artist). */
export const PLAN_ORDER: PlanKey[] = ["free", "artist", "artist_pro", "pro", "label", "enterprise"];

/** Plans each kind of account can pick. Labels can't buy the Artist plan; artists see Free and Artist. */
export const PLANS_FOR: Record<AccountKind, PlanKey[]> = { artist: ["free", "artist", "artist_pro"], label: ["free", "pro", "label", "enterprise"] };
export const accountKind = (k: string | null | undefined): AccountKind => (k === "artist" ? "artist" : "label");
export const isPlanKey = (p: unknown): p is PlanKey => typeof p === "string" && (PLAN_ORDER as string[]).includes(p);

/** The better of two plans; unknown values count as free. */
export function higherPlan(a: string | null | undefined, b: string | null | undefined): PlanKey {
  const ra = isPlanKey(a) ? PLAN_ORDER.indexOf(a) : 0;
  const rb = isPlanKey(b) ? PLAN_ORDER.indexOf(b) : 0;
  return PLAN_ORDER[Math.max(ra, rb)];
}

/** After a downgrade, a connected custom domain keeps serving pages this long, then its links redirect to droplr.fm. */
export const CUSTOM_DOMAIN_GRACE_DAYS = 14;

type DomainOrg = { plan: string | null; customDomain: string | null; planUpdatedAt?: Date | null; customDomainLiveAt?: Date | null };

/**
 * Whether the label's custom domain is in use right now.
 * - Plan includes custom domains: active.
 * - Plan doesn't (cancelled / downgraded): active until CUSTOM_DOMAIN_GRACE_DAYS after the plan changed, then off.
 * Off never means broken: pages on the domain redirect to the same page on droplr.fm, and new links use droplr.fm.
 */
export function customDomainStatus(org: DomainOrg): { domain: string | null; active: boolean; graceUntil: Date | null } {
  if (!org.customDomain) return { domain: null, active: false, graceUntil: null };
  if (planOf(org.plan).customDomain) return { domain: org.customDomain, active: true, graceUntil: null };
  const changed = org.planUpdatedAt ?? null;
  const graceUntil = changed ? new Date(changed.getTime() + CUSTOM_DOMAIN_GRACE_DAYS * 86_400_000) : null;
  return { domain: org.customDomain, active: !!graceUntil && graceUntil.getTime() > Date.now(), graceUntil };
}

/** The domain is switched on for the plan: requests arriving on it are served (or, when off, redirected to droplr.fm). */
export const activeCustomDomain = (org: DomainOrg) => (customDomainStatus(org).active ? org.customDomain : null);

/**
 * The domain to put in public links, or null to use droplr.fm.
 * Needs the plan AND a passed HTTPS check, so nobody copies a link on a domain that isn't connected yet (or has broken).
 */
export const linkCustomDomain = (org: DomainOrg) => (org.customDomainLiveAt ? activeCustomDomain(org) : null);

/**
 * Why an account can't switch between label and artist right now (null = it can).
 * Plans are per kind, so anything that pins a plan from the other side has to go first.
 */
export function kindChangeBlocker(org: { kind: string | null; stripeSubscriptionId: string | null; compPlan: string | null }, to: AccountKind): string | null {
  if (accountKind(org.kind) === to) return null;
  if (org.stripeSubscriptionId) return "It has a Stripe subscription. Cancel it (and let it end) before switching, or the paid plan won't match the account type.";
  if (org.compPlan && !PLANS_FOR[to].includes(org.compPlan as PlanKey)) return `Its complimentary ${planOf(org.compPlan).name} plan isn't available to ${to} accounts. Remove the comp first.`;
  return null;
}
