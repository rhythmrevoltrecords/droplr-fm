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
  version: "2026-10-05",
  updated: "5 October 2026",
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
 * What a remix contest entrant ticks, and the version stored against their entry.
 *
 * Unlike the two above, this one is an INTEGER as well as a label: ContestEntry.declarationVersion is
 * an int column and the gallery compares against it (`declarationVersion >= 2`), so the number has to
 * be usable in a query. The label is here for the changelog and for anyone auditing what a given
 * version said; the two move together and neither is edited alone.
 *
 * v1 → v2 on 29 Sep 2026: v1 said the label could listen and share it if they won, which is NOT
 * consent to being listed on a public page under your artist name with a vote button on it. Entries
 * made under v1 are excluded from the public gallery for exactly that reason, so this text is kept
 * rather than replaced — an entry's record has to keep meaning what it meant on the day.
 *
 * lib/contest.ts re-exports these; nothing else should define contest consent wording.
 */
export const CONTEST_DECLARATION_VERSION = 2;
export const CONTEST_DECLARATION_LABEL = "2026-09-29.contest-entry-v2-public-gallery";

export const CONTEST_DECLARATION_TEXT =
  "This remix is my own work. I made it from the stems the label provided, I haven't used any sample " +
  "or vocal I don't have the right to use, and I'm happy for my track to be listed publicly on this " +
  "page once entries close, under the artist name I gave, where anyone can play it and vote for it. " +
  "I understand droplr only stores my link and my contact details, not my audio.";

/** The first wording. Kept because entries made under it are still on record — see above. */
export const CONTEST_DECLARATION_V1_TEXT =
  "This remix is my own work. I made it from the stems the label provided, I haven't used any sample " +
  "or vocal I don't have the right to use, and I'm happy for the label to listen to it and share it " +
  "if I win. I understand droplr only stores my link and my contact details, not my audio.";

/**
 * What changed, newest first. The dashboard shows the entries newer than the version a login accepted,
 * so people see the actual changes rather than "the terms changed". Add an entry whenever LEGAL.version moves.
 */
export const LEGAL_UPDATES: { version: string; date: string; summary: string[] }[] = [
  {
    version: "2026-10-05",
    date: "5 October 2026",
    summary: [
      "One sentence in the Data Processing Terms, widened so it matches what we actually do. It already let us combine labels' data in aggregated, de-identified form to secure and improve the service; it now also covers describing how much droplr.fm is used overall \u2014 the sort of figure we'd give a prospective partner or put on a page about the platform.",
      "That means counts and nothing else: how many links, fans and accounts exist across droplr.fm. No address, no name, no individual detail, and no label is identified. Your fan list is still yours and is still never sold, shared or used for our own marketing.",
      "Nothing new is collected, nothing changed about how your releases or your fans are handled, and no setting of yours is affected.",
    ],
  },
  {
    version: "2026-10-02",
    date: "2 October 2026",
    summary: [
      "Short how-to videos now appear inside the dashboard, next to the thing they explain. They're hosted on YouTube, and a card shows only a still picture and a play button — nothing loads from Google until you press play, and you can close any card for good.",
      "Privacy: a new section says exactly what YouTube receives when you do press play — your IP address, your browser and device, and the page you were on — and that we never send it your name, your email or anything from your account. We use Google's reduced-tracking youtube-nocookie address.",
      "We also used this to disclose something that was already there and shouldn't have been undisclosed: on a public release page running a remix contest, an entry hosted on YouTube is embedded in the same way, and that one loads as you scroll to it rather than waiting for a click. That is the one place a fan, rather than an account holder, meets a third-party player on droplr.fm. The Cookie Policy says the same thing in its own words.",
      "The Cookie Policy's line that no third-party content runs in the dashboard has been corrected rather than left to go stale: no pixel ever loads there, and the only third-party content is a video player, only after you press play.",
      "Nothing new is collected by us. The videos are help content and are on every plan.",
    ],
  },
  {
    version: "2026-10-01",
    date: "1 October 2026",
    summary: [
      "Lyric cards: a share graphic that puts one line of your lyrics over your artwork. You type the line yourself in the release's settings — we never fetch lyrics from a lyrics service, and there is nothing to pre-fill it from, so the card only ever shows words you entered.",
      "You confirm you have the right to reproduce and publish that line. The words are a separate right from the recording and the artwork, and on a cover, a remix or a track you didn't write it may not be yours to quote.",
      "Unlike a clip, a share graphic is drawn on our servers, so the lyric line is stored on your release and we can clear it if we're told it infringes someone's rights. We still can't take down an image you've already posted — that goes to the platform you posted it on.",
      "The image is yours. We claim no ownership of it and no licence to it beyond drawing it for you, and on plans without branding removal the droplr.fm line is drawn into it the same way it is in a clip.",
      "Privacy: the lyric line is the only new thing stored, and it sits with your other release content.",
    ],
  },
  {
    version: "2026-09-29",
    date: "29 September 2026",
    summary: [
      "Remix contests: you can take remix entries on a release page. Entrants paste a link to their own upload — droplr.fm stores the link, the name they gave, their email and a dated copy of what they agreed to, and never the audio. As with a download gate, we can remove an entry's link but we cannot remove a file that isn't on our systems.",
      "You are the one running the contest, not us. You set the rules, the prize and the deadline, you judge it, and you deal with the winner. We provide the page and the list. Anything a competition or trade-promotion law requires of the person running it is yours to sort out, and we don't advise on it.",
      "Entrants confirm the remix is their own work, made from stems you provided, with no sample they don't have the right to use. We can't verify that, so an entry you judge is a claim the entrant made — not something we've checked.",
      "Once entries close, the entries are listed publicly on the release page: the artist name the entrant gave, their note, a player where the host allows one, and a vote button. Nothing is shown while entries are still open. Entrants are told this in the box they tick before entering, and anyone who entered under our earlier wording — which only mentioned the label listening — is left out of that list.",
      "Fans get one vote each per contest and can move it. Votes are public and advisory: you choose the winner, and we show you how many separate networks a vote count came from so you can judge what it's worth.",
      "An entrant can withdraw at any time using the link in their confirmation email. That link asks before it acts, and after the deadline a withdrawal can't be undone.",
      "Running a contest needs a paid plan. Entering one is always free. If your plan lapses while a contest is live it keeps running and stays editable, because your entrants were told a deadline.",
      "Privacy: what we store for an entrant and for a vote, and how long we keep it. A vote is recorded against the anonymous visitor ID we already set, with a hashed network address and no account.",
      "Exclusivity warnings: tell us a release is exclusive to a store and we'll warn you when a link on it looks like it breaks the window. That warning is our reading of rules Beatport and the distributors publish and change without notice, and we only see the links on that release — not your edits, your pre-orders elsewhere, or what your distributor actually delivered. It isn't legal or commercial advice, and your agreement with your distributor and the store governs.",
    ],
  },
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
