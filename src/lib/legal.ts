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
  version: "2026-09-25",
  updated: "25 September 2026",
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
 * Consent shown on a download gate's email step. Versioned separately from the pre-save one on
 * purpose: bumping a shared constant would retroactively change what every existing consent
 * record attests to, and a fan trading their address for a remix pack agreed to different words
 * from a fan asking to be told when a single comes out.
 */
export const DOWNLOAD_CONSENT_VERSION = "2026-09-21.download-gate-v1";

/**
 * What changed, newest first. The dashboard shows the entries newer than the version a login accepted,
 * so people see the actual changes rather than "the terms changed". Add an entry whenever LEGAL.version moves.
 */
export const LEGAL_UPDATES: { version: string; date: string; summary: string[] }[] = [
  {
    version: "2026-09-25",
    date: "25 September 2026",
    summary: [
      "Release clips: pick a few seconds of a track and droplr.fm makes a video for Reels or the feed. The whole thing happens in your browser — the audio is read from your own computer and never reaches us, so we hold no copy of the track or of the clip, and nothing about it is recorded.",
      "The clip is yours. We claim no ownership of it and no licence to it, and because we never see it we can't take one down for you — that has to go to the platform you posted it on.",
      "You confirm you have the right to the recording and the artwork you put in a clip, including any unofficial remix, bootleg or edit. That risk is yours, the same as for a download gate.",
      "On plans without branding removal a small droplr.fm line is drawn under your link inside the video. It's part of the image. That mark is why clips are included rather than charged for, and there's no cap on how many you make.",
      "Clips render on your own device, so what you get depends on it: browsers without WebCodecs record in real time and produce a WebM instead of an MP4, and phones are slow. We don't warrant a clip will render on any particular device.",
      "Custom domains: changing your domain no longer breaks the links already out on the old one. We keep serving the old hostname and redirect it to your current domain for twelve months, then release it. Anyone who later connects that hostname and proves they control its DNS takes precedence over the redirect immediately. Removing a domain outright still disconnects it straight away.",
      "Fan emails can now be sent at the same hour in each fan's own timezone, the way release-day emails already are. A send like that runs for about a day as the timezones come round, and contacts with no timezone on file get your own local hour.",
      "Privacy: nothing new is collected. Clips record nothing at all, and the timezone used for a local-time send is the one already held for that fan.",
    ],
  },
  {
    version: "2026-09-23",
    date: "23 September 2026",
    summary: [
      "You can import a fan list you collected before using droplr.fm. Consent you already hold carries over, because it was given to you and not to the tool that collected it — but you have to tell us where the addresses came from, roughly when, and what people agreed to, and confirm you collected them directly.",
      "An imported address is never added to a release-day email. It can only receive a news email you write and send yourself.",
      "A list collected only in exchange for a download isn't a subscription. Those contacts are marked unconfirmed and can't be emailed until the person confirms.",
      "An import can't undo an unsubscribe: any address that already opted out of your emails is skipped and not re-added.",
      "All droplr.fm email is sent from shared infrastructure, so a list that draws heavy complaints or bounces hurts delivery for everyone here. We may suspend sending, require a list to be re-confirmed, or delete an imported list that breaches the Acceptable Use Policy.",
      "Privacy: the Privacy Policy now explains what we store for an imported contact and how to be removed from one.",
    ],
  },
  {
    version: "2026-09-22",
    date: "22 September 2026",
    summary: [
      "Download gates: you can put a free file behind steps a fan takes first. droplr.fm stores the link, never the file — it stays wherever you keep it, and you're responsible for having the right to give it away.",
      "Only gate files you can legally distribute. If we're told a gated file infringes someone's rights we can switch the gate off, but we can't remove a file that isn't on our systems.",
      "A SoundCloud step performs the follow, like or repost the fan just authorised, then discards the access token immediately. We store nothing about their SoundCloud account.",
      "Instagram, TikTok, YouTube, Spotify and Facebook steps only open a link. No app can check whether someone followed on those platforms, we say so on the page, and you must not present those steps as verified.",
      "Privacy: gate emails are recorded with their own consent wording, separate from pre-saves, and which steps a visitor finished is kept against an anonymous visitor ID.",
    ],
  },
  {
    version: "2026-09-21",
    date: "21 September 2026",
    summary: [
      "Some screens now have a tick box for something we haven't built yet. Ticking it shares nothing and shows nothing publicly — it records that you want the feature, and we'll tell you before anything you've ticked is used.",
      "Pricing pages now show an approximate US dollar amount beside the Australian price. Billing is unchanged and still in Australian dollars — the US figure is a published guide, updated periodically, and never the amount charged.",
    ],
  },
  {
    version: "2026-09-20",
    date: "20 September 2026",
    summary: [
      "Shared release reports: you can turn on a link showing one release's totals. It's off until you turn it on, shows counts only with no fan named, and turning it off or reissuing it kills the old link straight away.",
      "The report link is unguessable but not password-protected — anyone you send it to can forward it, and the figures aren't audited.",
      "Notifications: promo plan reminders added to the kinds you can turn on.",
    ],
  },
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
