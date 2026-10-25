// Relative imports only, like lib/consent-events: kept usable outside Next.
import { sha256, signToken } from "./crypto";
import { prisma } from "./db";
import { BRAND, button, esc, layout, p, safeHex } from "./email-design";
import { emailConfigured, sendBatch } from "./email";
import { SITE_URL } from "./env";
import { optedOutAmong } from "./fan-consent";
import { allow, over, record } from "./throttle";
import { PLAN_LIMITS, planOf } from "./plans";
import { BIO_CONSENT_SOURCE as BIO_SOURCE } from "./bio-subscribe";

/**
 * Confirming ongoing email. Anyone can type anyone's address into a pre-save, a download gate or a
 * bio page, so ticking "send me news" or pressing Subscribe no longer puts an address on a list by
 * itself: the fan gets one email with a confirm button, and only once they press it does the
 * address get news from that account or go to its Mailchimp audience.
 *
 * Deliberately NOT for the pre-save itself. A pre-save sends one email, on release day, about the
 * release the fan asked for; making that two steps would lose real fans to save a stranger one
 * email that carries an unsubscribe link anyway (Cody, 26 Oct).
 *
 * Confirmation is per address per account. Once confirmed for a label, a later tick for that label
 * needs no second email.
 */


/**
 * Has this address already proven itself for this account's news? A bio-page contact that was
 * mailable before confirmation existed counts as proof: it was taken under the rules shown then
 * (and FanContact has no record of whether it was confirmed). Everything since needs the click.
 */
export async function newsConfirmed(organizationId: string, email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  const [ps, fc] = await Promise.all([
    // newsConsent too: an unsubscribe clears both, but a row must never prove anything on the
    // strength of a confirmation the fan has since taken back.
    prisma.preSave.count({ where: { email: e, newsConsent: true, newsConfirmedAt: { not: null }, release: { organizationId } } }),
    prisma.fanContact.count({ where: { organizationId, email: { equals: e, mode: "insensitive" }, consentSource: BIO_SOURCE, status: "mailable" } }),
  ]);
  return ps + fc > 0;
}

/**
 * What a confirm click does: every news tick this address gave this account counts from now, and a
 * bio-page subscription waiting on it becomes mailable. Imported contacts are not touched: they
 * never pressed anything droplr showed them.
 */
export async function confirmNews(organizationId: string, email: string, now = new Date()): Promise<number> {
  const e = email.trim().toLowerCase();
  if ((await optedOutAmong([e], organizationId)).size) return 0;
  const [a, b] = await Promise.all([
    prisma.preSave.updateMany({ where: { email: e, newsConsent: true, newsConfirmedAt: null, release: { organizationId } }, data: { newsConfirmedAt: now } }),
    prisma.fanContact.updateMany({ where: { organizationId, email: { equals: e, mode: "insensitive" }, consentSource: BIO_SOURCE, status: "pending" }, data: { status: "mailable" } }),
  ]);
  return a.count + b.count;
}

type Sender = (msg: { to: string; subject: string; html: string; text: string; fromName: string }) => Promise<void>;
let testSender: Sender | null = null;
/** Tests only: capture the email instead of sending it. */
export function setConfirmSenderForTests(s: Sender | null) {
  testSender = s;
}

/**
 * Call after a news tick or a bio subscribe has been written. Already confirmed for this account:
 * confirms the new tick at once and sends nothing. Otherwise sends the confirmation email, at most
 * once a day per address per account, so the form can't be used to flood someone's inbox.
 */
export async function requestNewsConfirmation(org: { id: string; name: string; accentColor?: string | null; plan?: string | null }, email: string): Promise<"confirmed" | "sent" | "skipped"> {
  const e = email.trim().toLowerCase();
  const paid = planOf(org.plan) !== PLAN_LIMITS.free;
  if (await newsConfirmed(org.id, e)) {
    await confirmNews(org.id, e);
    return "confirmed";
  }
  // Once a day per address per account, five a day per address across all accounts (or someone
  // could make a free account per email and send one inbox a confirmation from each), and a daily
  // ceiling per account: the From name is the account's own, so without one a fresh account could
  // use this to send its chosen name to any list of addresses. Real fans come at nowhere near it.
  const who = sha256(e).slice(0, 32);
  const day = 24 * 60 * 60 * 1000;
  const ceiling = paid ? 5000 : 200;
  // The account ceiling is checked first and without spending anything, so a fan turned away by
  // it hasn't also used up their own once-a-day slot. (Someone can still fill a free account's
  // ceiling with junk addresses; the ticks wait, and a fan who ticks again another day gets one.)
  if (await over(`news-confirm:org:${org.id}`, ceiling, day)) {
    console.warn("[news-confirm] daily ceiling reached", { org: org.id, ceiling });
    return "skipped";
  }
  if (!(await allow(`news-confirm:${org.id}:${who}`, 1, day)) || !(await allow(`news-confirm:any:${who}`, 5, day))) return "skipped";
  await record(`news-confirm:org:${org.id}`);
  const token = await signToken({ e, org: org.id }, "30d", "confirm");
  const url = `${SITE_URL}/api/news/confirm?t=${encodeURIComponent(token)}`;
  const msg = confirmEmail(org.name, org.accentColor ?? null, url);
  const send: Sender | null = testSender ?? (emailConfigured() ? async (m) => { await sendBatch([m]); } : null);
  if (!send) return "skipped";
  await send({ to: e, ...msg, fromName: org.name }).catch((err) => console.error("[news-confirm] send", err instanceof Error ? err.message : err));
  return "sent";
}

export function confirmEmail(orgName: string, accentColor: string | null, url: string) {
  const accent = safeHex(accentColor);
  const name = esc(orgName);
  return {
    // The account's name stays out of the subject: anyone can name a free account anything, and
    // a subject line is where that would read as a message. It is in the From name and the body.
    subject: "Please confirm your email",
    html: layout({
      preheader: `One tap to start getting news from ${orgName}.`,
      accent,
      brand: { name: orgName },
      body: `${p(`<strong style="color:${BRAND.text}">Is this you?</strong>`)}
${p(`Someone asked for news and new music from ${name} to be sent to this address. Press the button if it was you.`)}
<div style="margin:24px 0">${button(url, "Yes, send me news", accent)}</div>
${p(`<span style="color:${BRAND.muted}">If it wasn't you, ignore this email. Nothing else will be sent, and this address won't be added to anything.</span>`)}`,
      footer: `Sent once because this address was typed into a form for ${name}.`,
    }),
    text: `Someone asked for news and new music from ${orgName} to be sent to this address.\n\nIf it was you, confirm here: ${url}\n\nIf it wasn't you, ignore this email. Nothing else will be sent, and this address won't be added to anything.`,
  };
}

/**
 * News ticks the old code took during a deploy, under the wording that promised no confirmation
 * email (v3). They are confirmed as of when they were given, as the migration did for everything
 * before it. Keyed on the wording version, not a date, so nothing ticked under the new wording can
 * ever be swept in. Run from the scheduled release check; returns how many.
 */
export const PRE_CONFIRMATION_PRESAVE_WORDING = "2026-09-17.release-day-v3-news-optional";
export async function confirmLegacyNewsTicks(deadline = Date.now() + 20_000): Promise<number> {
  const rows = await prisma.preSave.findMany({
    where: { newsConsent: true, newsConfirmedAt: null, consentVersion: PRE_CONFIRMATION_PRESAVE_WORDING },
    select: { id: true, newsConsentAt: true, createdAt: true },
    take: 500,
  });
  let n = 0;
  for (const r of rows) {
    if (Date.now() > deadline) break;
    n += (await prisma.preSave.updateMany({ where: { id: r.id, newsConfirmedAt: null, newsConsent: true }, data: { newsConfirmedAt: r.newsConsentAt ?? r.createdAt } })).count;
  }
  return n;
}
