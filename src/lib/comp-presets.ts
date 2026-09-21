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
