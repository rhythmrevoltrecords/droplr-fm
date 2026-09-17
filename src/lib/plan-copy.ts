import { PLAN_LIMITS, PLAN_ORDER, type PlanKey } from "./plans";

/** Marketing strings derived from PLAN_LIMITS, so the homepage and /pricing never drift from what billing enforces. */

export const planPrice = (k: PlanKey) => (PLAN_LIMITS[k].price === null ? "Custom" : `$${PLAN_LIMITS[k].price}`);
/** "/mo" suffix only for plans with a listed price. */
export const priceSuffix = (k: PlanKey) => (PLAN_LIMITS[k].price === null ? "" : "/mo");

const compact = (n: number) => (n >= 1000 && n % 1000 === 0 ? `${n / 1000}k` : n.toLocaleString("en-AU"));

export function releasesLine(k: PlanKey) {
  const n = PLAN_LIMITS[k].releases;
  return n === Infinity ? "Unlimited releases" : `${n} release${n === 1 ? "" : "s"}`;
}

export function artistsLine(k: PlanKey) {
  const n = PLAN_LIMITS[k].artists;
  return n === Infinity ? "Unlimited artists" : n === 1 ? "1 artist" : `Up to ${n} artists`;
}

export function clicksLine(k: PlanKey) {
  const n = PLAN_LIMITS[k].clicksPerMonth;
  return n === Infinity ? "Uncapped clicks" : `${compact(n)} clicks / month`;
}

export const PLAN_KEYS = PLAN_ORDER;
