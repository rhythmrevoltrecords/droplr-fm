/**
 * One place for the legal identity used across /legal pages, signup and checkout.
 * Source of truth: ABR record for ABN 13 399 505 837 and ASIC business name registration.
 */
export const LEGAL = {
  /** Legal entity: a sole trader, so the contracting party is the person (ABR: MORRISON, CODY LUKE HAROLD). */
  owner: "Cody Morrison",
  /** Registered business name (ASIC, from 1 Sep 2026). A business name is not a separate legal entity. */
  operator: "Rhythm Revolt Records",
  service: "droplr.fm",
  abn: "13 399 505 837",
  /** Not registered for GST (ABR, checked 16 Sep 2026). Flip when registered: prices for Australian consumers must then include GST. */
  gstRegistered: false,
  address: "PO Box 109, Zillmere QLD 4034, Australia",
  state: "Queensland",
  /** Bump when a document changes materially; stored on User.termsVersion at signup. */
  version: "2026-09-19",
  updated: "19 September 2026",
  /** Kept for existing imports: the general contact address. */
  email: "hello@droplr.fm",
} as const;

/**
 * Inboxes (all can be aliases routed to one Purelymail mailbox).
 * Sending addresses for app email are env vars, not these: RESEND_FROM_EMAIL (fan release-day mail)
 * and ACCOUNT_FROM_EMAIL (password resets and account notices).
 */
export const CONTACT = {
  hello: "hello@droplr.fm", // general, sales, Enterprise
  support: "support@droplr.fm", // account and login help
  billing: "billing@droplr.fm", // invoices, charges, refunds
  privacy: "privacy@droplr.fm", // privacy and data requests, DPA
  legal: "legal@droplr.fm", // copyright and trade mark complaints, legal notices
  abuse: "abuse@droplr.fm", // spam, phishing, harmful pages
  security: "security@droplr.fm", // vulnerability reports
} as const;

/**
 * Version of the fan consent line on the email pre-save form (src/components/public/release-view.tsx:
 * "Email me on release day. {label} can send me updates about this release. Unsubscribe anytime. Privacy").
 * v2 added the Privacy link. v3 added the separate, optional "news and new music" box (PreSave.newsConsent).
 * Change this whenever that wording changes; it's stored on PreSave.consentVersion as proof of consent.
 */
export const FAN_EMAIL_CONSENT_VERSION = "2026-09-17.release-day-v3-news-optional";

/**
 * What changed, newest first. The dashboard shows the entries newer than the version a login accepted,
 * so people see the actual changes rather than "the terms changed". Add an entry whenever LEGAL.version moves.
 */
export const LEGAL_UPDATES: { version: string; date: string; summary: string[] }[] = [
  {
    version: "2026-09-19",
    date: "19 September 2026",
    summary: [
      "Fan emails: you can now send your own email to fans who ticked the optional news box, and droplr.fm delivers it as you.",
      "You write it and you're responsible for it; we only deliver it to fans who opted in to news, re-check that consent just before each batch, and put a working unsubscribe link on every message.",
      "Privacy: what we record for each fan email — the address, which send it belonged to, when it went out and any delivery failure.",
    ],
  },
  {
    version: "2026-09-18",
    date: "18 September 2026",
    summary: [
      "Notifications: how the installed app and push notifications work, and that they're off until you turn them on.",
      "Feedback: we can act on ideas you send us, and what not to send through it.",
      "Guides and templates: general information, not legal or financial advice, and what you may do with the templates.",
      "Privacy: push subscriptions, feedback messages and invite records added to what we collect and how long we keep it.",
      "Acceptable use: no self-referral, no sharing personal invite links, no reselling our templates.",
    ],
  },
];

/** True when this login agreed to an older version of the documents. */
export const needsReaccept = (acceptedVersion: string | null | undefined) => !!acceptedVersion && acceptedVersion !== LEGAL.version;

/** The changes since the version this login accepted (newest first). */
export function updatesSince(acceptedVersion: string | null | undefined) {
  if (!acceptedVersion) return [];
  const i = LEGAL_UPDATES.findIndex((u) => u.version === acceptedVersion);
  return i === -1 ? LEGAL_UPDATES : LEGAL_UPDATES.slice(0, i);
}

export const LEGAL_DOCS = [
  { slug: "terms", title: "Terms of Service", short: "Terms", blurb: "The agreement between your label and droplr.fm." },
  { slug: "privacy", title: "Privacy Policy", short: "Privacy", blurb: "What we collect from labels, artists and fans, and why." },
  { slug: "billing", title: "Billing & Refund Policy", short: "Billing & refunds", blurb: "Subscriptions, renewals, cancellations and refunds." },
  { slug: "cookies", title: "Cookie Policy", short: "Cookies", blurb: "Cookies and pixels on droplr.fm and label pages." },
  { slug: "acceptable-use", title: "Acceptable Use Policy", short: "Acceptable use", blurb: "What you can't use droplr.fm for." },
  { slug: "data-processing", title: "Data Processing Terms", short: "Data processing", blurb: "How we handle fan data on your behalf." },
  { slug: "copyright", title: "Copyright & Trade Marks", short: "Copyright", blurb: "Who owns what, and how to report infringement." },
] as const;

export type LegalSlug = (typeof LEGAL_DOCS)[number]["slug"];

/** "Cody Morrison trading as Rhythm Revolt Records (ABN 13 399 505 837)" */
export const operatorLine = `${LEGAL.owner} trading as ${LEGAL.operator}${LEGAL.abn ? ` (ABN ${LEGAL.abn})` : ""}`;

export const copyrightLine = (year = new Date().getFullYear()) => `© ${year} ${LEGAL.owner} trading as ${LEGAL.operator}. All rights reserved.`;
