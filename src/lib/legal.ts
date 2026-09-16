/**
 * One place for the legal identity used across /legal pages, signup and checkout.
 * Fill in `abn` before launch — the ABN line only renders once it's set.
 */
export const LEGAL = {
  operator: "Rhythm Revolt Records",
  service: "droplr.fm",
  abn: "", // e.g. "12 345 678 901"
  address: "PO Box 109, Zillmere QLD 4034, Australia",
  email: "hello@droplr.fm",
  state: "Queensland",
  /** Bump when a document changes materially; stored on User.termsVersion at signup. */
  version: "2026-09-16",
  updated: "16 September 2026",
} as const;

/**
 * Version of the fan consent line on the email pre-save form (src/components/public/release-view.tsx:
 * "Email me on release day. {label} can send me updates about this release. Unsubscribe anytime.").
 * Change this whenever that wording changes; it's stored on PreSave.consentVersion as proof of consent.
 */
export const FAN_EMAIL_CONSENT_VERSION = "2026-09-16.release-day-v1";

export const LEGAL_DOCS = [
  { slug: "terms", title: "Terms of Service", short: "Terms", blurb: "The agreement between your label and droplr.fm." },
  { slug: "privacy", title: "Privacy Policy", short: "Privacy", blurb: "What we collect from labels, artists and fans, and why." },
  { slug: "billing", title: "Billing & Refund Policy", short: "Billing & refunds", blurb: "Subscriptions, renewals, cancellations and refunds." },
  { slug: "cookies", title: "Cookie Policy", short: "Cookies", blurb: "Cookies and pixels on droplr.fm and label pages." },
  { slug: "acceptable-use", title: "Acceptable Use Policy", short: "Acceptable use", blurb: "What you can't use droplr.fm for." },
  { slug: "data-processing", title: "Data Processing Terms", short: "Data processing", blurb: "How we handle fan data on your behalf." },
] as const;

export type LegalSlug = (typeof LEGAL_DOCS)[number]["slug"];

export const operatorLine = `${LEGAL.operator}${LEGAL.abn ? ` (ABN ${LEGAL.abn})` : ""}, trading as ${LEGAL.service}`;
