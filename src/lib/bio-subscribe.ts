/**
 * The subscribe button on a bio page: who it may keep, what it says, and where the row lands.
 *
 * No clock, no database, no request. Everything here is a pure function so the rules can be
 * tested without standing up Postgres, and so the wording the fan agreed to is decided in one
 * place rather than inside a JSX file.
 *
 * The rule the rest of the codebase has to respect, written here because this is the file
 * someone reads when they change it:
 *
 *   A PAGE CAPTURE IS NOT AN IMPORT.
 *
 * Both live in FanContact, told apart by consentSource. An import was typed in by the account
 * holder, attesting to consent droplr never saw, so it starts `pending` and stays out of every
 * send until someone confirms it. A page capture is the fan's own act, on wording droplr showed
 * and recorded, so it is mailable immediately — and it must not be filtered by the rules written
 * for imports. lib/news.ts carries that carve-out; see the comment there.
 */

/** consentSource for a row the fan typed into a bio page themselves. */
export const BIO_CONSENT_SOURCE = "bio";

/** Is this FanContact row something a fan gave droplr directly, rather than a bulk import? */
export function isPageCaptured(consentSource: string | null | undefined): boolean {
  return consentSource === BIO_CONSENT_SOURCE;
}

/**
 * Deliberately stricter than the RFC: it must have an @, a dot in the domain, and a TLD of at
 * least two characters. Same expression as the pre-save form, on purpose — a fan whose address
 * is good enough for one droplr form and not the other would have no way of knowing why.
 */
export const BIO_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const BIO_EMAIL_MAX = 254;

export function normaliseEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function emailAcceptable(raw: unknown): boolean {
  const e = normaliseEmail(raw);
  return e.length > 0 && e.length <= BIO_EMAIL_MAX && BIO_EMAIL_RE.test(e);
}

export const BIO_SUBSCRIBE_TEXT_MAX = 28;
export const DEFAULT_SUBSCRIBE_TEXT = "Get my new music";

/** Button wording: the owner's, trimmed, or the default. Never empty, never past the cap. */
export function subscribeButtonText(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return DEFAULT_SUBSCRIBE_TEXT;
  return t.slice(0, BIO_SUBSCRIBE_TEXT_MAX);
}

/**
 * What the fan is agreeing to, in one sentence, naming who will be emailing them.
 *
 * It names the account, not droplr: droplr is not the sender and saying otherwise would make the
 * consent cover the wrong party. "Unsubscribe anytime" is not decoration — under the Spam Act
 * 2003 a commercial message needs a functional unsubscribe, and promising it at the point of
 * consent is how the fan knows it exists before they hand anything over.
 */
export function subscribeConsentLine(orgName: string): string {
  return `${orgName} can email me about new music. Unsubscribe anytime.`;
}

/** Heading above the form. Short on purpose: the links are what the page is for. */
export function subscribeHeading(): string {
  return "Hear it first";
}

/**
 * Stored verbatim on the row as consentNote, so that if this is ever questioned there is a record
 * of the actual words rather than a shrug. Mirrors what the importer is made to type in.
 */
export function subscribeConsentNote(orgName: string): string {
  return `Ticked "${subscribeConsentLine(orgName)}" on a droplr bio page.`;
}

/**
 * Should the block render at all?
 *
 * The page's own switch decides. There is deliberately no plan check: an account on Free can
 * collect addresses and can SEE every one of them. Exporting the list is what the paid plans
 * buy. Gating the collecting instead would mean an artist's fans were lost rather than locked,
 * and a fan who is never asked cannot be unlocked later by an upgrade.
 */
export function showSubscribe(page: { subscribe?: string | null }): boolean {
  return page.subscribe === "on";
}
