// Relative imports only, like lib/consent-events: kept usable outside Next.
import { sha256, signToken } from "./crypto";
import { prisma } from "./db";
import { BRAND, button, esc, layout, p, safeHex } from "./email-design";
import { emailConfigured, sendBatch } from "./email";
import { SITE_URL } from "./env";
import { optedOutAmong } from "./fan-consent";
import { forget, hit } from "./throttle";
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
    // Every pending contact row for this address, an import included: the person has now pressed
    // a confirm button themselves, which is better evidence than any importer's word.
    prisma.fanContact.updateMany({ where: { organizationId, email: { equals: e, mode: "insensitive" }, status: "pending" }, data: { status: "mailable" } }),
  ]);
  if (a.count + b.count) await prisma.newsConfirmRequest.deleteMany({ where: { organizationId, email: e } });
  return a.count + b.count;
}

type Sender = (msg: { to: string; subject: string; html: string; text: string; fromName: string }) => Promise<void>;
let testSender: Sender | null = null;
/** Tests only: capture the email instead of sending it. */
export function setConfirmSenderForTests(s: Sender | null) {
  testSender = s;
}

type Org = { id: string; name: string; accentColor?: string | null; plan?: string | null };
const DAY = 24 * 60 * 60 * 1000;

/**
 * Call after a news tick or a bio subscribe has been written. Already confirmed for this account:
 * confirms the new tick at once and sends nothing. Otherwise the confirmation email is sent, or,
 * when the account's daily ceiling is reached, queued and sent by the release check once there is
 * room (sendQueuedConfirmations).
 */
export async function requestNewsConfirmation(org: Org, email: string): Promise<"confirmed" | "sent" | "queued" | "skipped"> {
  const e = email.trim().toLowerCase();
  if (await newsConfirmed(org.id, e)) {
    await confirmNews(org.id, e);
    return "confirmed";
  }
  await prisma.newsConfirmRequest.upsert({
    where: { organizationId_email: { organizationId: org.id, email: e } },
    create: { organizationId: org.id, email: e },
    update: { requestedAt: new Date() },
  });
  try {
    const r = await sendConfirmation(org, e);
    return r === "full" ? "queued" : r;
  } catch (err) {
    if (err instanceof RateLimited) return "queued";
    throw err;
  }
}

class RateLimited extends Error {}

/** Plans that get the paid ceiling, from the plan table itself (planOf's rule: unknown means free). */
const PAID_PLANS = Object.keys(PLAN_LIMITS).filter((k) => PLAN_LIMITS[k as keyof typeof PLAN_LIMITS] !== PLAN_LIMITS.free);

/**
 * The send itself, shared by a fresh request and the queue.
 *
 * 1. Claim the row: one UPDATE that only succeeds if nothing was sent to this address for this
 *    account in the last day. Two submits at once, or a submit racing the queue, can't both win.
 * 2. Take a slot under the account's daily ceiling (the From name is the account's own, so without
 *    one a fresh free account could send its chosen name to any list of addresses) and under five
 *    a day per address across all accounts. hit() inserts then counts, so parallel calls can't all
 *    squeeze under; a refused or failed attempt gives its slot back.
 * 3. Send. If it fails, the claim and both slots are released and the request stays queued.
 *
 * Under a burst at the ceiling, parallel hits can all count each other and all be refused: safe,
 * they stay queued and the next run sends them. If the function dies between the claim and the
 * send, that one request looks sent and is not retried; the fan gets one again by ticking after a
 * day. A duplicate email was judged the worse failure.
 */
async function sendConfirmation(org: Org, e: string): Promise<"sent" | "full" | "queued" | "skipped"> {
  const send: Sender | null = testSender ?? (emailConfigured() ? async (m) => { await sendBatch([m]); } : null);
  if (!send) return "skipped";
  // Times from JS, not the database's now(): Prisma stores UTC in columns without a time zone, and
  // now() follows the session's zone, so mixing the two skews every comparison by the zone offset.
  const claimed = await prisma.$executeRaw`
    UPDATE "NewsConfirmRequest" SET "sentAt" = ${new Date()}
    WHERE "organizationId" = ${org.id} AND email = ${e}
      AND ("sentAt" IS NULL OR "sentAt" < ${new Date(Date.now() - DAY)})`;
  if (!claimed) return "skipped";
  const release = async () => {
    await prisma.newsConfirmRequest.updateMany({ where: { organizationId: org.id, email: e }, data: { sentAt: null } });
  };
  const slots: string[] = [];
  const giveBack = async () => {
    await forget(slots);
    await release();
  };
  const ceiling = planOf(org.plan) !== PLAN_LIMITS.free ? 5000 : 200;
  const a = await hit(`news-confirm:org:${org.id}`, ceiling, DAY);
  slots.push(a.id);
  if (!a.ok) {
    console.warn("[news-confirm] daily ceiling reached, queued", { org: org.id, ceiling });
    await giveBack();
    return "full";
  }
  const b = await hit(`news-confirm:any:${sha256(e).slice(0, 32)}`, 5, DAY);
  slots.push(b.id);
  if (!b.ok) {
    await giveBack();
    return "queued";
  }
  const token = await signToken({ e, org: org.id }, "30d", "confirm");
  const url = `${SITE_URL}/api/news/confirm?t=${encodeURIComponent(token)}`;
  const msg = confirmEmail(org.name, org.accentColor ?? null, url);
  try {
    await send({ to: e, ...msg, fromName: org.name });
  } catch (err) {
    await giveBack();
    console.error("[news-confirm] send", err instanceof Error ? err.message : err);
    if ((err as { retryAfter?: number }).retryAfter !== undefined || /\b429\b/.test(String(err))) throw new RateLimited();
    return "queued";
  }
  return "sent";
}

/** Is a tick still waiting on this confirmation? */
async function stillWaiting(organizationId: string, e: string): Promise<boolean> {
  if ((await optedOutAmong([e], organizationId)).size) return false;
  const [ps, fc] = await Promise.all([
    prisma.preSave.count({ where: { email: e, newsConsent: true, newsConfirmedAt: null, release: { organizationId } } }),
    prisma.fanContact.count({ where: { organizationId, email: { equals: e, mode: "insensitive" }, consentSource: BIO_SOURCE, status: "pending" } }),
  ]);
  return ps + fc > 0;
}

/**
 * Run from the scheduled release check: send queued confirmations.
 *
 * Picked per account, newest first, at most 50 per account per run, from accounts that aren't at
 * their ceiling, so one account flooded with junk addresses can't fill the batch and hold every
 * other account's fans back, and its own real fans who tick on later days go before the junk.
 * Paced at the news sender's rate, and a rate-limit answer from the provider ends the run.
 * Unsent requests older than a week are dropped (ticking again queues a fresh one); sent ones are
 * kept 30 days, the confirm link's life. Returns how many were sent.
 */
export async function sendQueuedConfirmations(deadline = Date.now() + 20_000, pauseMs = 600): Promise<number> {
  const now = Date.now();
  await prisma.newsConfirmRequest.deleteMany({
    where: { OR: [{ sentAt: null, requestedAt: { lt: new Date(now - 7 * DAY) } }, { sentAt: { lt: new Date(now - 30 * DAY) } }] },
  });
  const queued = await prisma.$queryRaw<{ id: string; organizationId: string; email: string }[]>`
    SELECT id, "organizationId", email FROM (
      SELECT q.id, q."organizationId", q.email,
        ROW_NUMBER() OVER (PARTITION BY q."organizationId" ORDER BY q."requestedAt" DESC) AS n
      FROM "NewsConfirmRequest" q
      JOIN "Organization" o ON o.id = q."organizationId"
      WHERE q."sentAt" IS NULL
        AND (SELECT count(*) FROM "AuthThrottle" t
             WHERE t.key = 'news-confirm:org:' || q."organizationId" AND t."createdAt" > ${new Date(now - DAY)})
            < CASE WHEN o.plan = ANY(${PAID_PLANS}) THEN 5000 ELSE 200 END
    ) ranked WHERE n <= 50
    ORDER BY n, "organizationId"
    LIMIT 500`;
  const orgs = new Map<string, Org | null>();
  const full = new Set<string>();
  let sent = 0;
  for (const q of queued) {
    if (Date.now() > deadline) break;
    if (full.has(q.organizationId)) continue;
    if (!orgs.has(q.organizationId)) {
      orgs.set(q.organizationId, await prisma.organization.findUnique({ where: { id: q.organizationId }, select: { id: true, name: true, accentColor: true, plan: true } }));
    }
    const org = orgs.get(q.organizationId);
    if (!org) continue;
    // Confirmed in the meantime (a click racing a new tick): confirm the new tick, owe nothing.
    if (await newsConfirmed(org.id, q.email)) {
      await confirmNews(org.id, q.email);
      await prisma.newsConfirmRequest.deleteMany({ where: { id: q.id, sentAt: null } });
      continue;
    }
    if (!(await stillWaiting(org.id, q.email))) {
      await prisma.newsConfirmRequest.deleteMany({ where: { id: q.id, sentAt: null } });
      continue;
    }
    let r: "sent" | "full" | "queued" | "skipped";
    try {
      r = await sendConfirmation(org, q.email);
    } catch (e) {
      if (e instanceof RateLimited) break;
      throw e;
    }
    if (r === "sent") {
      sent++;
      if (pauseMs) await new Promise((res) => setTimeout(res, pauseMs));
    } else if (r === "full") full.add(org.id);
  }
  return sent;
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
