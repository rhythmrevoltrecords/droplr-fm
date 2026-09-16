export type PlanKey = "free" | "pro" | "label" | "enterprise";

export const PLAN_LIMITS: Record<PlanKey, {
  name: string;
  price: number;
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
  enterprise: { name: "Enterprise", price: 199, releases: Infinity, clicksPerMonth: Infinity, artists: Infinity, customDomain: true, pixels: true, byoSpotify: true, csvExport: true, qr: true, removeBranding: true, whiteLabel: true },
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
