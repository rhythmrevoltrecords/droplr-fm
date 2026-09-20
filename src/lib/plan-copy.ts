import { PLAN_LIMITS, PLAN_ORDER, type PlanKey } from "./plans";
import { usdFromAud } from "./fx";

/** Marketing strings derived from PLAN_LIMITS, so the homepage and /pricing never drift from what billing enforces. */

export const planPrice = (k: PlanKey) => (PLAN_LIMITS[k].price === null ? "Custom" : `A$${PLAN_LIMITS[k].price}`);
/** Indicative USD beside the AUD price. Billing is always AUD — see src/lib/fx.ts. */
export const planPriceUsd = (k: PlanKey) => usdFromAud(PLAN_LIMITS[k].price);
/** "/mo" suffix only for plans with a listed price. */
export const priceSuffix = (k: PlanKey) => (PLAN_LIMITS[k].price === null ? "" : "/mo");

const compact = (n: number) => (n >= 1000 && n % 1000 === 0 ? `${n / 1000}k` : n.toLocaleString("en-AU"));

export function releasesLine(k: PlanKey) {
  const n = PLAN_LIMITS[k].releases;
  return n === Infinity ? "Unlimited releases" : `${n} new release${n === 1 ? "" : "s"} a year`;
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

export function insightsLine(k: PlanKey) {
  const n = PLAN_LIMITS[k].insightsDays;
  return n === Infinity ? "Full analytics history" : `${n}-day analytics history`;
}

export function emailsLine(k: PlanKey) {
  const n = PLAN_LIMITS[k].releaseEmails;
  return n === Infinity ? "Release-day email to every pre-saver" : `Release-day email to the first ${n} pre-savers per release`;
}

export const yearlyPrice = (k: PlanKey) => (PLAN_LIMITS[k].yearly === null ? null : `A$${PLAN_LIMITS[k].yearly}`);
export const yearlyPriceUsd = (k: PlanKey) => usdFromAud(PLAN_LIMITS[k].yearly);

/** Feature bullets per plan, shared by /pricing, the homepage and Settings → Billing. */
export function planFeatures(k: PlanKey): string[] {
  const common = ["Email pre-saves in each fan's timezone", "Promo plan + share graphics"];
  switch (k) {
    case "free":
      return [releasesLine(k), clicksLine(k), emailsLine(k), ...common, insightsLine(k), "Fan list (view only)", "yourname.droplr.fm links"];
    case "artist":
      return [releasesLine(k), clicksLine(k), emailsLine(k), ...common, insightsLine(k), "Fan list with news opt-ins + CSV export", "Meta, TikTok and GA4 pixels", "QR codes for flyers and merch"];
    case "artist_pro":
      return ["Everything in Artist", releasesLine(k), clicksLine(k), insightsLine(k), "Custom domain (music.yourname.com)", "No droplr.fm branding on pages and graphics", "Spotify library pre-save for your VIPs (your own Spotify app)", "News emails to opted-in fans (coming soon)"];
    case "pro":
      return [releasesLine(k), clicksLine(k), artistsLine(k), emailsLine(k), "Artist logins + roster profiles", "Custom domain, connected for you", "Pixels, CSV export, QR codes", "Remove droplr.fm branding", insightsLine(k)];
    case "label":
      return ["Everything in Pro", clicksLine(k), artistsLine(k), "Team roles (admins)", "Analytics across the whole roster"];
    case "enterprise":
      return ["Everything in Label", clicksLine(k), "Priority support and onboarding", "SSO (coming soon)"];
  }
}

export const PLAN_BLURB: Record<PlanKey, string> = {
  free: "Try it on your next few releases.",
  artist: "For an artist releasing through the year.",
  artist_pro: "For an artist building a brand of their own.",
  pro: "For a label putting out music every month.",
  label: "For a roster with a team behind it.",
  enterprise: "Distributors and big catalogues.",
};

/**
 * Which complimentary-plan notice this account should see right now, if any.
 *
 *  - granted: a comp is running and this grant hasn't been acknowledged (compSetAt newer than compNoticeAt).
 *  - ended:   a comp had an end date, that date has passed, and the ending hasn't been acknowledged.
 *
 * Both are stamped with the value they were about, so a later comp raises its own notice.
 */
export function compNoticeFor(
  org: { compPlan: string | null; compSetAt: Date | null; compUntil: Date | null; compNoticeAt: Date | null; compEndedNoticeAt: Date | null },
  now = new Date(),
): "granted" | "ended" | null {
  if (!org.compPlan || !org.compSetAt) return null;
  const lapsed = !!org.compUntil && org.compUntil.getTime() <= now.getTime();
  if (lapsed) {
    const told = org.compEndedNoticeAt?.getTime() ?? 0;
    return told >= org.compUntil!.getTime() ? null : "ended";
  }
  const told = org.compNoticeAt?.getTime() ?? 0;
  return told >= org.compSetAt.getTime() ? null : "granted";
}
