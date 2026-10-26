// Notice-date reminders for agreements. Run by the release-check job.
// Relative imports only: this is bundled into a Netlify function.
import { prisma } from "./db";
import { accountEmailShell } from "./account-email";
import { button, esc, muted, p } from "./email-design";
import { SITE_URL } from "./env";
import { dayString, noticeDay } from "./agreements";
import { mailer } from "./promo-reminders";
import { pushConfigured, sendPush, teamUserIds, wants } from "./push";
import { zonedDay, zonedLocalToDate } from "./time";

export function agreementNoticeEmail(a: { id: string; title: string; endsOn: Date; notice: Date }) {
  const end = dayString(a.endsOn), by = dayString(a.notice);
  const url = `${SITE_URL}/admin/agreements/${a.id}`;
  const subject = `Notice due: ${a.title}`;
  const html = accountEmailShell(subject, `${p(`${esc(a.title)} ends on ${end}. With its notice period, notice is due by ${by}. If you mean to renew it, take up an option or end it, now is the time.`)}
<div style="margin:24px 0">${button(url, "Open the agreement")}</div>
${muted(`droplr works this out from the dates your team entered, not from the document. Check the agreement itself. Turn these emails off on your <a href="${esc(`${SITE_URL}/admin/settings/account#task-emails-card`)}" style="color:#A1A1AA">account page</a>.`)}`);
  const text = `${subject}\n\n${a.title} ends on ${end}. Notice is due by ${by}.\n${url}\n\ndroplr works this out from the dates your team entered, not from the document. Check the agreement itself.`;
  return { subject, html, text };
}

/** Notices land at 9am on the notice day in the account's timezone, not on the first run after midnight. */
export const NOTICE_HOUR = 9;

/**
 * Signed agreements whose notice day has arrived (in the account's timezone) and whose end hasn't
 * passed. Claimed with noticeRemindedAt, so each is reminded once per end date and notice period.
 * Goes to the label's owners and admins only: an artist login never sees agreements.
 */
export async function notifyAgreementNotices(now = new Date(), force = false, deadline = Date.now() + 10_000) {
  const canPush = force || pushConfigured();
  const send = mailer();
  if (!canPush && !send) return 0;
  const candidates = await prisma.$queryRaw<{ id: string }[]>`
    SELECT a."id" FROM "Agreement" a
    JOIN "Organization" o ON o."id" = a."organizationId"
    -- A beta switched off for the account means no reminders (lib/beta). In SQL, so those rows
    -- can't take places in the LIMIT from accounts that have it on.
    WHERE 'agreements' = ANY(o."betaFeatures") AND a."status" = 'signed' AND a."endsOn" IS NOT NULL AND a."noticeRemindedAt" IS NULL
      AND a."endsOn" >= (${new Date(now.getTime() - 2 * 86_400_000).toISOString()}::timestamptz AT TIME ZONE 'UTC')
      AND a."endsOn" - COALESCE(a."noticeDays", 30) * interval '1 day' <= (${new Date(now.getTime() + 2 * 86_400_000).toISOString()}::timestamptz AT TIME ZONE 'UTC')
    ORDER BY a."endsOn" ASC
    LIMIT 200`;
  if (!candidates.length) return 0;
  const rows = await prisma.agreement.findMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    select: { id: true, title: true, endsOn: true, noticeDays: true, organizationId: true, organization: { select: { timezone: true, kind: true } } },
  });
  let sent = 0;
  for (const a of rows) {
    if (Date.now() > deadline) break;
    if (!a.endsOn || a.organization.kind === "artist") continue;
    const tz = a.organization.timezone;
    const today = zonedDay(now, tz);
    const notice = noticeDay(a)!;
    if (dayString(a.endsOn) < today) continue;
    // Due from 9am local on the notice day; a notice day already past (the reminder was added late) is due now.
    if (zonedLocalToDate(`${dayString(notice)}T${String(NOTICE_HOUR).padStart(2, "0")}:00`, tz).getTime() > now.getTime()) continue;
    // Only claim what reaches someone: a push needs a subscribed login that wants these, an email a login that hasn't turned them off.
    const team = await teamUserIds(a.organizationId);
    const users = team.length ? await prisma.user.findMany({ where: { id: { in: team } }, select: { id: true, email: true, taskEmails: true, pushPrefs: true, _count: { select: { pushSubscriptions: true } } } }) : [];
    const pushTo = canPush ? users.filter((u) => u._count.pushSubscriptions > 0 && wants(u.pushPrefs, "agreements")).map((u) => u.id) : [];
    const mailTo = send ? users.filter((u) => u.taskEmails).map((u) => u.email) : [];
    if (!pushTo.length && !mailTo.length) continue;
    // The claim names the dates it was worked out from: an edit between the read and here makes it miss, and the new dates are reminded next run.
    const claim = await prisma.agreement.updateMany({ where: { id: a.id, noticeRemindedAt: null, status: "signed", endsOn: a.endsOn, noticeDays: a.noticeDays }, data: { noticeRemindedAt: now } });
    if (!claim.count) continue;
    if (pushTo.length) {
      await sendPush(pushTo, "agreements", { title: `Notice due: ${a.title}`, body: `It ends ${dayString(a.endsOn)}. Renew, take up an option or end it.`, url: `/admin/agreements/${a.id}`, tag: `agreement-${a.id}` });
    }
    if (mailTo.length) {
      const msg = agreementNoticeEmail({ id: a.id, title: a.title, endsOn: a.endsOn, notice });
      const results = await Promise.allSettled(mailTo.map((to) => send!({ to, ...msg })));
      for (const r of results) if (r.status === "rejected") console.error("[agreements] notice email", r.reason instanceof Error ? r.reason.message : r.reason);
    }
    sent++;
  }
  return sent;
}
