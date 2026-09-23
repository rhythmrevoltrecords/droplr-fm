import { Prisma } from "@prisma/client";
import { signToken } from "./crypto";
import { prisma } from "./db";
import { BRAND, button, esc, h1, layout, muted, p, safeHex, safeHttps } from "./email-design";
import { sendBatch } from "./email";
import { SITE_URL } from "./env";
import { planOf } from "./plans";

/**
 * News emails: a one-off send from a label/artist to the fans who ticked the optional
 * "news and new music" box when they pre-saved.
 *
 * This is deliberately a separate path from the release-day email. Release-day consent
 * covers exactly one release and droplr sends that on the label's behalf; news consent is
 * the only basis for emailing a fan about anything else (Spam Act 2003, s16). Every
 * recipient of a news email must have said yes explicitly, and every send carries a
 * working unsubscribe that suppresses the whole label — the same link the release-day
 * email uses, so a fan only ever has to unsubscribe once.
 */

export const NEWS_BODY_MAX = 5000;
export const NEWS_SUBJECT_MAX = 120;
/** Resend takes 100 per batch; the pause keeps us inside its rate limit. */
const BATCH = 100;
const BATCH_PAUSE_MS = 600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type NewsFilter = { country?: string | null; listenOn?: string | null; releaseId?: string | null };

export const canSendNews = (plan: string) => planOf(plan).newsEmails;

function audienceWhere(orgId: string, f: NewsFilter) {
  const parts = [Prisma.sql`r."organizationId" = ${orgId}`, Prisma.sql`p.email IS NOT NULL`];
  if (f.releaseId) parts.push(Prisma.sql`p."releaseId" = ${f.releaseId}`);
  return Prisma.join(parts, " AND ");
}

function audienceHaving(f: NewsFilter) {
  // Opted in to news AND never unsubscribed from this label. bool_or across every row for
  // the address, so one unsubscribe anywhere wins over an older opt-in.
  const parts = [Prisma.sql`bool_or(p."newsConsent") AND NOT bool_or(p.status = 'unsubscribed')`];
  if (f.country) parts.push(Prisma.sql`(array_agg(p.country ORDER BY p."createdAt" DESC) FILTER (WHERE p.country IS NOT NULL))[1] = ${f.country}`);
  if (f.listenOn) parts.push(Prisma.sql`(array_agg(p."listenOn" ORDER BY p."createdAt" DESC) FILTER (WHERE p."listenOn" IS NOT NULL))[1] = ${f.listenOn}`);
  return Prisma.join(parts, " AND ");
}

export type AudienceRow = { email: string; preSaveId: string | null; fanContactId: string | null };

/**
 * Imported contacts this send may reach.
 *
 * Only ones marked mailable — a transactional import stays pending until the person confirms.
 * Anyone who unsubscribed from this label through a pre-save is excluded here too: the opt-out
 * is to the label, and an import must never quietly undo one.
 *
 * Skipped entirely when the send is filtered by release or by listening platform, because an
 * imported address has neither. Better to reach fewer people than to pretend we know something
 * about them that we don't.
 */
async function importedAudience(orgId: string, f: NewsFilter) {
  if (f.releaseId || f.listenOn) return [];
  return prisma.$queryRaw<{ email: string; fanContactId: string }[]>`
    SELECT c.email AS email, c.id AS "fanContactId"
    FROM "FanContact" c
    WHERE c."organizationId" = ${orgId}
      AND c.status = 'mailable'
      ${f.country ? Prisma.sql`AND c.country = ${f.country}` : Prisma.empty}
      AND NOT EXISTS (
        SELECT 1 FROM "PreSave" p JOIN "Release" r ON r.id = p."releaseId"
        WHERE r."organizationId" = ${orgId} AND lower(p.email) = c.email
      )`;
}

/** Everyone this send would reach, one row per address, with the id its unsubscribe token points at. */
export async function newsAudience(orgId: string, f: NewsFilter): Promise<AudienceRow[]> {
  const [fans, imported] = await Promise.all([
    prisma.$queryRaw<{ email: string; preSaveId: string }[]>`
    SELECT lower(p.email) AS email,
      (array_agg(p.id ORDER BY p."createdAt" DESC))[1] AS "preSaveId"
    FROM "PreSave" p JOIN "Release" r ON r.id = p."releaseId"
    WHERE ${audienceWhere(orgId, f)}
    GROUP BY lower(p.email)
    HAVING ${audienceHaving(f)}`,
    importedAudience(orgId, f),
  ]);
  const seen = new Set(fans.map((r) => r.email));
  return [
    ...fans.map((r) => ({ email: r.email, preSaveId: r.preSaveId, fanContactId: null })),
    ...imported.filter((r) => !seen.has(r.email)).map((r) => ({ email: r.email, preSaveId: null, fanContactId: r.fanContactId })),
  ];
}

export async function newsAudienceCount(orgId: string, f: NewsFilter) {
  const [[row], imported] = await Promise.all([
    prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM (
      SELECT lower(p.email)
      FROM "PreSave" p JOIN "Release" r ON r.id = p."releaseId"
      WHERE ${audienceWhere(orgId, f)}
      GROUP BY lower(p.email)
      HAVING ${audienceHaving(f)}
    ) x`,
    importedAudience(orgId, f),
  ]);
  return Number(row?.n ?? 0) + imported.length;
}

/** How many of this org's imported contacts are mailable — shown next to the audience count. */
export async function importedMailableCount(orgId: string) {
  return prisma.fanContact.count({ where: { organizationId: orgId, status: "mailable" } });
}

/** Plain text as typed → escaped paragraphs. Never raw HTML: the body is user input. */
function bodyHtml(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => p(esc(para).replace(/\n/g, "<br/>")))
    .join("");
}

type RenderArgs = {
  subject: string;
  body: string;
  buttonLabel?: string | null;
  buttonUrl?: string | null;
  orgName: string;
  logoUrl?: string | null;
  accentColor?: string | null;
  showBranding?: boolean;
  unsub: string; // signed token, or a placeholder for previews
};

/** Pure render, so the compose screen and /platform/emails can preview it without sending. */
export function renderNewsEmail(args: RenderArgs) {
  const accent = safeHex(args.accentColor);
  const unsubUrl = `${SITE_URL}/api/unsubscribe?t=${args.unsub}`;
  const cta = safeHttps(args.buttonUrl) && args.buttonLabel?.trim()
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px"><tr><td align="center">${button(safeHttps(args.buttonUrl)!, args.buttonLabel!.trim(), accent)}</td></tr></table>`
    : "";

  const body = `${h1(args.subject)}${bodyHtml(args.body)}${cta}${muted(
    `You're getting this because you asked ${esc(args.orgName)} to keep you posted about news and new music.`,
  )}`;

  const footer = `Sent by ${esc(args.orgName)}.<br/>
<a href="${esc(unsubUrl)}" style="color:${BRAND.muted};text-decoration:underline">Unsubscribe</a>${
    args.showBranding ? `<br/><br/><a href="https://droplr.fm" style="color:${BRAND.faint};text-decoration:none">Fan emails by <strong style="color:${BRAND.muted}">droplr.fm</strong></a>` : ""
  }`;

  const preheader = args.body.replace(/\s+/g, " ").trim().slice(0, 140) || args.subject;
  const html = layout({ preheader, accent, brand: { name: args.orgName, logoUrl: args.logoUrl }, body, footer });
  const textCta = safeHttps(args.buttonUrl) && args.buttonLabel?.trim() ? `\n\n${args.buttonLabel!.trim()}: ${args.buttonUrl}` : "";
  const text = `${args.subject}\n\n${args.body.trim()}${textCta}\n\nSent by ${args.orgName} because you asked to hear about news and new music.\nUnsubscribe: ${unsubUrl}`;

  return {
    subject: args.subject,
    html,
    text,
    headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

export async function newsEmailFor(args: Omit<RenderArgs, "unsub"> & { preSaveId?: string | null; fanContactId?: string | null }) {
  // An imported contact has no PreSave row to point at, so its token names the contact instead.
  const unsub = args.fanContactId
    ? await signToken({ fc: args.fanContactId, act: "unsub" }, "365d", "unsub")
    : await signToken({ ps: args.preSaveId!, act: "unsub" }, "365d", "unsub");
  return renderNewsEmail({ ...args, unsub });
}

/**
 * Freeze the audience before any sending starts. One row per address means a send can
 * span several worker runs and still never email anyone twice.
 */
export async function snapshotAudience(newsEmailId: string) {
  const news = await prisma.newsEmail.findUnique({ where: { id: newsEmailId } });
  if (!news) return 0;
  const rows = await newsAudience(news.organizationId, {
    country: news.filterCountry,
    listenOn: news.filterListenOn,
    releaseId: news.filterReleaseId,
  });
  if (rows.length) {
    await prisma.newsEmailDelivery.createMany({
      data: rows.map((r) => ({ newsEmailId, email: r.email, preSaveId: r.preSaveId, fanContactId: r.fanContactId })),
      skipDuplicates: true,
    });
  }
  const recipients = await prisma.newsEmailDelivery.count({ where: { newsEmailId } });
  await prisma.newsEmail.update({ where: { id: newsEmailId }, data: { recipients } });
  return recipients;
}

export type NewsResult = { id: string; sent: number; failed: number; stoppedEarly: boolean; notes: string[] };

/** Sends (or resumes) one news email. Leased, so overlapping worker runs can't double-send. */
export async function processNewsEmail(newsEmailId: string, deadlineMs = Date.now() + 14 * 60 * 1000): Promise<NewsResult> {
  const out: NewsResult = { id: newsEmailId, sent: 0, failed: 0, stoppedEarly: false, notes: [] };
  const leaseUntil = new Date(Math.max(deadlineMs, Date.now()) + 2 * 60_000);
  const leased = await prisma.newsEmail.updateMany({
    where: { id: newsEmailId, status: { in: ["scheduled", "sending"] }, OR: [{ processingUntil: null }, { processingUntil: { lt: new Date() } }] },
    data: { processingUntil: leaseUntil, status: "sending", startedAt: new Date() },
  });
  if (leased.count !== 1) {
    out.notes.push("already being processed by another run");
    return out;
  }

  try {
    const news = await prisma.newsEmail.findUnique({ where: { id: newsEmailId }, include: { organization: true } });
    if (!news) return out;
    const org = news.organization;

    if (!canSendNews(org.plan)) {
      await prisma.newsEmail.update({ where: { id: newsEmailId }, data: { status: "failed", lastError: "News emails are on the paid plans." } });
      out.notes.push("plan does not include news emails");
      return out;
    }

    if (!news.recipients) await snapshotAudience(newsEmailId);

    for (;;) {
      if (Date.now() > deadlineMs) {
        out.stoppedEarly = true;
        break;
      }
      const pending = await prisma.newsEmailDelivery.findMany({
        where: { newsEmailId, sentAt: null, error: null },
        take: BATCH,
        orderBy: { createdAt: "asc" },
      });
      if (!pending.length) break;

      // Someone may have unsubscribed between the snapshot and this batch. Their consent
      // at send time is what matters, so re-check and drop them rather than emailing.
      const [optedOut, importedOut] = await Promise.all([
        prisma.preSave.findMany({
          where: { email: { in: pending.map((d) => d.email) }, status: "unsubscribed", release: { organizationId: org.id } },
          select: { email: true },
          distinct: ["email"],
        }),
        // Same check for imported contacts: they can unsubscribe from any earlier send, and that
        // has to bind before the next batch goes out, not after it.
        prisma.fanContact.findMany({
          where: { email: { in: pending.map((d) => d.email) }, organizationId: org.id, status: { not: "mailable" } },
          select: { email: true },
        }),
      ]);
      const gone = new Set([
        ...optedOut.map((r) => r.email!.toLowerCase()),
        ...importedOut.map((r) => r.email.toLowerCase()),
      ]);
      const dropped = pending.filter((d) => gone.has(d.email));
      if (dropped.length) {
        await prisma.newsEmailDelivery.updateMany({ where: { id: { in: dropped.map((d) => d.id) } }, data: { error: "unsubscribed before send" } });
      }
      const batch = pending.filter((d) => !gone.has(d.email));
      if (!batch.length) continue;

      const messages = await Promise.all(
        batch.map(async (d) => ({
          to: d.email,
          fromName: org.emailFromName || org.name,
          replyTo: org.emailReplyTo,
          ...(await newsEmailFor({
            preSaveId: d.preSaveId,
            fanContactId: d.fanContactId,
            subject: news.subject,
            body: news.body,
            buttonLabel: news.buttonLabel,
            buttonUrl: news.buttonUrl,
            orgName: org.emailFromName || org.name,
            logoUrl: org.logoUrl,
            accentColor: org.accentColor,
            showBranding: !planOf(org.plan).removeBranding,
          })),
        })),
      );

      const now = new Date();
      try {
        await sendBatch(messages);
        await prisma.newsEmailDelivery.updateMany({ where: { id: { in: batch.map((d) => d.id) } }, data: { sentAt: now } });
        out.sent += batch.length;
      } catch (e) {
        const { retryAfter, status } = e as { retryAfter?: number; status?: number };
        if (retryAfter) {
          await sleep(retryAfter * 1000);
          continue;
        }
        if (!status || status >= 500 || status === 401 || status === 403) {
          // Resend is down or misconfigured: leave the rest pending for the next run.
          out.notes.push(`batch failed: ${String(e).slice(0, 200)}`);
          out.stoppedEarly = true;
          break;
        }
        // One bad address fails the whole batch: retry individually so the rest still go.
        for (const m of messages) {
          if (Date.now() > deadlineMs) {
            out.stoppedEarly = true;
            break;
          }
          const row = batch.find((d) => d.email === m.to)!;
          try {
            await sendBatch([m]);
            await prisma.newsEmailDelivery.update({ where: { id: row.id }, data: { sentAt: new Date() } });
            out.sent++;
          } catch (single) {
            const s = single as { status?: number };
            if (s.status && s.status < 500 && s.status !== 429 && s.status !== 401 && s.status !== 403) {
              await prisma.newsEmailDelivery.update({ where: { id: row.id }, data: { error: String(single).slice(0, 300) } });
              out.failed++;
            } else {
              out.stoppedEarly = true;
              break;
            }
          }
          await sleep(BATCH_PAUSE_MS);
        }
        if (out.stoppedEarly) break;
      }
      await sleep(BATCH_PAUSE_MS);
    }

    const [sent, failed, left] = await Promise.all([
      prisma.newsEmailDelivery.count({ where: { newsEmailId, sentAt: { not: null } } }),
      prisma.newsEmailDelivery.count({ where: { newsEmailId, error: { not: null } } }),
      prisma.newsEmailDelivery.count({ where: { newsEmailId, sentAt: null, error: null } }),
    ]);
    await prisma.newsEmail.update({
      where: { id: newsEmailId },
      data: { sent, failed, ...(left ? {} : { status: "sent", sentAt: new Date() }) },
    });
    return out;
  } finally {
    await prisma.newsEmail.updateMany({ where: { id: newsEmailId, processingUntil: leaseUntil }, data: { processingUntil: null } }).catch(() => {});
  }
}

/** Scheduled sends whose moment has passed, plus any send interrupted mid-way. */
export async function findDueNewsEmails() {
  return prisma.newsEmail.findMany({
    where: {
      OR: [
        { status: "scheduled", OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }] },
        { status: "sending" },
      ],
    },
    select: { id: true },
    orderBy: { scheduledFor: "asc" },
    take: 100,
  });
}
