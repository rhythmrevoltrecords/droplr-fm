/**
 * AUD → USD, for the indicative US price shown beside the AUD price on the marketing pages.
 *
 * Everything is billed in Australian dollars. Stripe charges the listed AUD amount and the
 * customer's own bank converts on the day at whatever rate it uses, so the USD figures here
 * are a guide for sizing the price up — never a quote, and never what gets charged.
 *
 * Hand-maintained on purpose. A live FX call would put a third-party dependency on a
 * marketing page for a number that moves a few percent a year, and would need a fallback
 * anyway. Re-check this with the distributor prices and grant dates each quarter and change
 * the one constant.
 */
export const AUD_USD = 0.7121;
export const AUD_USD_CHECKED = "18 September 2026";

/** Indicative USD, whole dollars. Null for free plans and plans with no listed price. */
export function usdFromAud(aud: number | null): string | null {
  if (aud === null || aud <= 0) return null;
  return `US$${Math.round(aud * AUD_USD)}`;
}
