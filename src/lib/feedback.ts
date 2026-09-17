import "server-only";
import { accountEmailConfigured, accountEmailShell, sendAccountEmail } from "./account-email";
import { button, quote } from "./email-design";
import { isLabelRole } from "./auth";
import { SITE_URL } from "./env";
import { platformAdminEmails } from "./platform";
import { prisma } from "./db";
import { sendPush } from "./push";

export const FEEDBACK_CATEGORIES = { idea: "Idea", bug: "Something's broken", question: "Question", other: "Other" } as const;
export type FeedbackCategory = keyof typeof FEEDBACK_CATEGORIES;
export const isFeedbackCategory = (c: unknown): c is FeedbackCategory => typeof c === "string" && c in FEEDBACK_CATEGORIES;
export const FEEDBACK_BODY_MAX = 4000;
export const FEEDBACK_SUBJECT_MAX = 120;

/** Where a user's feedback lives: label team → /admin, roster artist logins → /dashboard. */
export const feedbackBase = (role: string) => (isLabelRole(role) ? "/admin/feedback" : "/dashboard/feedback");

/** First line of the message, trimmed, when they didn't write a subject. */
export function subjectFrom(subject: string, body: string) {
  const s = subject.trim() || body.trim().split("\n")[0];
  return s.length > FEEDBACK_SUBJECT_MAX ? `${s.slice(0, FEEDBACK_SUBJECT_MAX - 1)}…` : s;
}

/** Only same-site paths are kept as "the page they were on". */
export function safePage(raw: unknown) {
  const p = typeof raw === "string" ? raw.trim() : "";
  return p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/\\") && p.length <= 300 ? p : null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const cta = (url: string, label: string) => `<div style="margin:24px 0 4px">${button(url, label)}</div>`;

/** Best-effort: a failed email never blocks the message being saved. */
export async function notifyTeam(t: { id: string; subject: string; category: string }, from: { email: string; orgName: string; plan: string }, body: string, isNew: boolean) {
  const admins = await prisma.user.findMany({ where: { email: { in: platformAdminEmails() }, role: "owner", emailVerifiedAt: { not: null } }, select: { id: true } });
  await sendPush(admins.map((a) => a.id), "feedback", { title: isNew ? `New feedback from ${from.orgName}` : `${from.orgName} replied`, body: body.slice(0, 140), url: `/platform/feedback/${t.id}`, tag: `feedback-${t.id}` }).catch((e) => console.error("[push feedback team]", e));
  if (!accountEmailConfigured()) return;
  const url = `${SITE_URL}/platform/feedback/${t.id}`;
  const title = isNew ? `New feedback: ${t.subject}` : `Reply on: ${t.subject}`;
  await Promise.allSettled(
    platformAdminEmails().map((to) =>
      sendAccountEmail({
        to,
        subject: `[droplr feedback] ${t.subject}`,
        html: accountEmailShell(esc(title), `<p style="margin:0 0 14px;color:#a1a1aa;font-size:13px">${esc(from.email)} · ${esc(from.orgName)} · ${esc(from.plan)} · ${esc(FEEDBACK_CATEGORIES[t.category as FeedbackCategory] ?? t.category)}</p>${quote(body)}${cta(url, "Reply in the platform console")}`),
        text: `${title}\n${from.email} · ${from.orgName} · ${from.plan}\n\n${body}\n\n${url}`,
      }),
    ),
  ).then((r) => r.forEach((x) => x.status === "rejected" && console.error("[feedback notify team]", x.reason)));
}

export async function notifyUser(t: { id: string; subject: string }, user: { id?: string; email: string; role: string }, body: string) {
  if (user.id) await sendPush([user.id], "feedback", { title: "The droplr.fm team replied", body: body.slice(0, 140), url: `/admin/feedback/${t.id}`, artistUrl: `/dashboard/feedback/${t.id}`, tag: `feedback-${t.id}` }).catch((e) => console.error("[push feedback user]", e));
  if (!accountEmailConfigured()) return;
  const url = `${SITE_URL}${feedbackBase(user.role)}/${t.id}`;
  try {
    await sendAccountEmail({
      to: user.email,
      subject: `Re: ${t.subject}`,
      html: accountEmailShell("The droplr.fm team replied", `<p style="margin:0 0 14px;color:#a1a1aa;font-size:13px">About: ${esc(t.subject)}</p>${quote(body)}${cta(url, "Read and reply")}`),
      text: `The droplr.fm team replied about "${t.subject}":\n\n${body}\n\nReply here: ${url}`,
    });
  } catch (err) {
    console.error("[feedback notify user]", err);
  }
}
