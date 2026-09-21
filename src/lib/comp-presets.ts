import { PLAN_LIMITS, type PlanKey } from "./plans";

/**
 * Canned wording for the two free-text boxes on a complimentary plan, so granting one is a
 * couple of picks rather than writing a sentence each time.
 *
 * Both lists end with "Custom…" in the UI, which reveals the plain text box again — these are a
 * shortcut, not a restriction.
 *
 * Keep FOUNDER_RATE in step with the founding offer in droplr/founder-pitch-script.md. The rate
 * is per plan on purpose: the artist rate must never get quoted to a label.
 */

/** Shown in the "you've been comped" notice, under the headline. */
export const COMP_NOTES = [
  "Founding artist — thanks for being first.",
  "Founding label — thanks for backing this early.",
  "On the house while you get your first release out.",
  "Complimentary account from droplr.fm.",
  "Extended — no rush, take the time you need.",
] as const;

/** What a founding account pays once the comp lapses, by the plan they were comped onto. */
const FOUNDER_RATE: Partial<Record<PlanKey, number>> = {
  artist: 8,
  artist_pro: 17,
  pro: 19,
  label: 55,
};

/**
 * Options for the "what they pay after" box, for the plan actually being comped.
 * First entry is the founding rate where one exists, so the common case is the default.
 */
export function afterOptions(plan: PlanKey | "none"): string[] {
  if (plan === "none" || !(plan in PLAN_LIMITS)) return [];
  const key = plan as PlanKey;
  const founder = FOUNDER_RATE[key];
  const normal = PLAN_LIMITS[key].price;
  const out: string[] = [];
  // "Price held", never "locked in". There is no minimum term — /legal/billing says cancel any
  // time — so wording that implies a 24-month commitment would misrepresent what's on offer.
  if (founder) out.push(`A$${founder}/mo, and that price held for 24 months`);
  if (founder) out.push(`A$${founder}/mo for 12 months, then the normal price`);
  if (normal) out.push(`the normal ${PLAN_LIMITS[key].name} price, A$${normal}/mo`);
  out.push("whatever you'd like to pay — get in touch and we'll sort it");
  return out;
}

/**
 * Whether a founding rate can still be claimed, and how long is left.
 *
 * This is what the account is *told*. The thing that actually stops a late claim is the Stripe
 * coupon's own redeem_by date, which has to be set to match — droplr never applies the discount
 * itself, it points at a promotion code.
 */
export function founderOffer(
  org: { founderPrice: string | null; founderOfferUntil: Date | null; founderCode: string | null },
  now = new Date(),
): { price: string; until: Date | null; code: string | null; expired: boolean } | null {
  if (!org.founderPrice) return null;
  const expired = !!org.founderOfferUntil && org.founderOfferUntil.getTime() <= now.getTime();
  return { price: org.founderPrice, until: org.founderOfferUntil, code: org.founderCode, expired };
}

/** How long after a comp ends the founding rate stays claimable. 0 = no deadline. */
export const CLAIM_WINDOWS: [number, string][] = [
  [30, "Claim within 30 days of it ending"],
  [60, "Claim within 60 days"],
  [90, "Claim within 90 days"],
  [0, "No deadline to claim"],
];

/**
 * The Stripe side of a founding rate. One coupon per plan, reused by everyone — not one per
 * person. A promotion code can be redeemed by any number of customers; max_redemptions caps the
 * total across all of them.
 *
 * Set each coupon up once as:
 *   amount_off      = the difference below, in AUD cents
 *   duration        = repeating, duration_in_months = 24   ← this *is* "price held for 24 months"
 *   applies_to      = that plan's product, so an artist code can't be used on a label plan
 *   max_redemptions = how many founding spots that tier has
 *   redeem_by       = the claim deadline you set here, or the date in droplr means nothing
 *
 * droplr never applies a discount itself. It shows the code; Stripe enforces all of the above.
 */
export const FOUNDER_CODES: Partial<Record<PlanKey, string>> = {
  artist: "FOUNDING-ARTIST",
  artist_pro: "FOUNDING-ARTISTPRO",
  pro: "FOUNDING-PRO",
  label: "FOUNDING-LABEL",
};

/** AUD off per month to reach the founding rate, for the coupon's amount_off. */
export function founderAmountOff(plan: PlanKey): number | null {
  const founder = FOUNDER_RATE[plan];
  const normal = PLAN_LIMITS[plan].price;
  return founder && normal ? normal - founder : null;
}
