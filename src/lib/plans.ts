export type PlanKey = "free" | "pro" | "label" | "enterprise";

export const PLAN_LIMITS: Record<PlanKey, {
  name: string;
  /** Monthly AUD incl. tax. null = not self-serve (Enterprise: contact us). */
  price: number | null;
  releases: number;
  clicksPerMonth: number;
  artists: number;
  customDomain: boolean;
  pixels: boolean;
  byoSpotify: boolean;
  csvExport: boolean;
  qr: boolean;
  removeBranding: boolean;
  whiteLabel: boolean;
}> = {
  free: { name: "Free", price: 0, releases: 3, clicksPerMonth: 1_000, artists: 1, customDomain: false, pixels: false, byoSpotify: false, csvExport: false, qr: false, removeBranding: false, whiteLabel: false },
  pro: { name: "Pro", price: 29, releases: Infinity, clicksPerMonth: 50_000, artists: 5, customDomain: true, pixels: true, byoSpotify: true, csvExport: true, qr: true, removeBranding: true, whiteLabel: false },
  label: { name: "Label", price: 79, releases: Infinity, clicksPerMonth: 250_000, artists: Infinity, customDomain: true, pixels: true, byoSpotify: true, csvExport: true, qr: true, removeBranding: true, whiteLabel: true },
  enterprise: { name: "Enterprise", price: null, releases: Infinity, clicksPerMonth: Infinity, artists: Infinity, customDomain: true, pixels: true, byoSpotify: true, csvExport: true, qr: true, removeBranding: true, whiteLabel: true },
};

export function planOf(plan: string | null | undefined) {
  return PLAN_LIMITS[(plan as PlanKey) in PLAN_LIMITS ? (plan as PlanKey) : "free"];
}

export const PLAN_ORDER: PlanKey[] = ["free", "pro", "label", "enterprise"];
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
