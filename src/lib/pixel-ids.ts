/**
 * The shape of each ad-pixel id an account can set. Pure: the settings route and the public
 * Pixels component both use it.
 *
 * Strict on purpose. A pixel id ends up inside a script that runs on droplr.fm itself, the same
 * origin as the dashboard. The old rule ("letters, numbers, - and _") let a GA4 field take a
 * Google Tag Manager id (GTM-…), and a Tag Manager container can carry any JavaScript its owner
 * writes, which would then run with a logged-in visitor's session. Only the real formats pass.
 */
export const PIXEL_ID_RULES = {
  /** Meta (Facebook) pixel: a long number. */
  meta: /^\d{8,20}$/,
  /** TikTok pixel: upper-case letters and digits. */
  tiktok: /^[A-Z0-9]{15,30}$/,
  /** GA4 measurement id: G- then letters and digits. Never GTM-, never UA-. */
  ga4: /^G-[A-Z0-9]{4,15}$/,
} as const;

export type PixelKind = keyof typeof PIXEL_ID_RULES;

export const PIXEL_ID_HINT: Record<PixelKind, string> = {
  meta: "A Meta pixel id is a number, like 123456789012345",
  tiktok: "A TikTok pixel id is letters and numbers, like C1A2B3C4D5E6F7G8H9I0",
  ga4: "A GA4 measurement id starts with G-, like G-AB12CD34EF",
};

/** The id if it has the right shape for that pixel, else null. Empty means "not set". */
export function pixelId(kind: PixelKind, v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s && PIXEL_ID_RULES[kind].test(s) ? s : null;
}
