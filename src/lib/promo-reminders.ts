// "This is due today" reminders for the release plan: the built-in promo steps and the label's own
// tasks. Run by the release-check job. Relative imports only: this is bundled into a Netlify function.
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { accountEmailConfigured, accountEmailShell, sendAccountEmail } from "./account-email";
import { button, esc, muted, p } from "./email-design";
import { SITE_URL } from "./env";
import { downloadPromoSteps, promoSteps, promoStepsFor, stepDate } from "./promo";
import { pushConfigured, sendPush, teamUserIds } from "./push";
import { isAssignee, reaches, TASK_LIMITS, type Assignee } from "./release-tasks";

/**
 * How late a step can be and still earn a nudge. Without a window, adding a release two
 * weeks before release day would fire every step from -28 onwards at once; with it, only
 * steps that came due in the last couple of days are announced, and older ones go quiet.
 */
const WINDOW_MS = 2 * 86_400_000;

/**
 * Releases close enough to release day that the plan is live.
 *
 * TO_MS is derived from the plan rather than written down. It was a hardcoded 10 days, which was
 * right while the last step was +7 — and silently wrong the moment steps were added at +14 through
 * +60: the release drops out of this query before they come due, so those steps would appear on the
 * Promo tab and never nudge, which is worse than not having them. Deriving it means the next person
 * who adds a later step gets the reminder for free instead of a bug nobody can see.
 */
const LAST_DAY = Math.max(...promoSteps("label").map((s) => s.day), ...promoSteps("artist").map((s) => s.day), ...downloadPromoSteps("label").map((s) => s.day));
const FROM_MS = 45 * 86_400_000;
const TO_MS = LAST_DAY * 86_400_000 + WINDOW_MS;
/** A task can sit up to a year either side of release day, so its releases are looked for that far out. */
const TASK_SPAN_MS = Math.max(-TASK_LIMITS.minDay, TASK_LIMITS.maxDay) * 86_400_000 + WINDOW_MS;

type Mail = { to: string; subject: string; html: string; text: string };
let testMailer: ((m: Mail) => Promise<void>) | null = null;
/** Tests only: capture reminder emails instead of sending them. */
export function setTaskMailerForTests(m: ((m: Mail) => Promise<void>) | null) {
  testMailer = m;
}
/** The reminder email sender, or null when email isn't set up. Shared with the agreement notices. */
export const mailer = () => testMailer ?? (accountEmailConfigured() ? sendAccountEmail : null);

/** The release's artist login, when it has one inside the same account. Linked accounts elsewhere are read-only and get nothing. */
function artistLogin(r: { organizationId: string; artist: { id: string; organizationId: string } | null; artistProfile: { user: { id: string; organizationId: string } | null } | null }) {
  const u = r.artist ?? r.artistProfile?.user ?? null;
  return u && u.organizationId === r.organizationId ? u.id : null;
}

const RELEASE_SELECT = {
  id: true,
  title: true,
  artistName: true,
  releaseDate: true,
  kind: true,
  organizationId: true,
  organization: { select: { kind: true, timezone: true } },
  artist: { select: { id: true, organizationId: true } },
  artistProfile: { select: { user: { select: { id: true, organizationId: true } } } },
} as const;

type Item = { releaseId: string; releaseTitle: string; title: string; body: string | null };

/** Collects, per user, what came due for them in this run; one email each at the end. */
class Digest {
  private by = new Map<string, { role: "team" | "artist"; items: Item[] }>();
  add(userIds: string[], role: "team" | "artist", item: Item) {
    for (const id of userIds) {
      const e = this.by.get(id) ?? { role, items: [] };
      e.items.push(item);
      this.by.set(id, e);
    }
  }
  async send() {
    const send = mailer();
    if (!send || !this.by.size) return 0;
    const users = await prisma.user.findMany({ where: { id: { in: [...this.by.keys()] }, taskEmails: true }, select: { id: true, email: true } });
    let sent = 0;
    // Ten at a time: fast enough for the scheduled function's limit, gentle enough for Resend's rate limit.
    for (let i = 0; i < users.length; i += 10) {
      const batch = await Promise.allSettled(users.slice(i, i + 10).map((u) => send({ to: u.email, ...taskReminderEmail(this.by.get(u.id)!.items, this.by.get(u.id)!.role) })));
      for (const b of batch) {
        if (b.status === "fulfilled") sent++;
        else console.error("[promo] task email", b.reason instanceof Error ? b.reason.message : b.reason);
      }
    }
    return sent;
  }
}

export function taskReminderEmail(items: Item[], role: "team" | "artist") {
  const one = items.length === 1 ? items[0] : null;
  const subject = one ? `Due today: ${one.title} (${one.releaseTitle})` : `${items.length} things due today on your releases`;
  const href = (i: Item) => (role === "artist" ? `${SITE_URL}/dashboard#release-${i.releaseId}` : `${SITE_URL}/admin/releases/${i.releaseId}?tab=promo`);
  const settings = `${SITE_URL}${role === "artist" ? "/dashboard/account" : "/admin/settings/account"}#task-emails-card`;
  const list = items
    .map((i) => `<li style="margin:0 0 12px"><a href="${esc(href(i))}" style="color:#F4F4F5;font-weight:600">${esc(i.title)}</a><br/><span style="color:#A1A1AA">${esc(i.releaseTitle)}${i.body ? ` · ${esc(i.body.slice(0, 200))}` : ""}</span></li>`)
    .join("");
  const html = accountEmailShell(
    one ? `Due today: ${one.title}` : `${items.length} things are due today`,
    `${p(one ? `On ${esc(one.releaseTitle)}. It was assigned to you on the release plan.` : "Each was assigned to you on a release plan.")}
<ul style="margin:0 0 16px;padding-left:18px">${list}</ul>
<div style="margin:24px 0">${button(href(items[0]), "Open the plan")}</div>
${muted(`You get this because a task on a droplr.fm release was assigned to you. Turn these emails off on your <a href="${esc(settings)}" style="color:#A1A1AA">account page</a>.`)}`,
  );
  const text = `${subject}\n\n${items.map((i) => `- ${i.title} (${i.releaseTitle})${i.body ? `: ${i.body.slice(0, 200)}` : ""}\n  ${href(i)}`).join("\n")}\n\nTurn these emails off on your account page: ${settings}`;
  return { subject, html, text };
}

/**
 * When a task comes due, computed in SQL from the release date and the account's timezone, the
 * same way stepDate does it in JS: noon on release day in that timezone, plus `day` whole days.
 * Computed rather than stored, so moving a release or changing the timezone can never leave a
 * stale date behind. Used to pick candidates; stepDate still decides.
 */
const TASK_DUE_SQL = Prisma.sql`((date_trunc('day', (r."releaseDate" AT TIME ZONE 'UTC') AT TIME ZONE z."tz") + interval '12 hours') AT TIME ZONE z."tz") + t."day" * interval '24 hours'`;
/**
 * The account's zone as Postgres knows it, or Brisbane — the same fallback stepDate uses. A zone
 * Node knows and the database doesn't would otherwise make the query throw for every account.
 */
const TASK_ZONE_JOIN = Prisma.sql`CROSS JOIN LATERAL (SELECT COALESCE((SELECT n."name" FROM pg_timezone_names n WHERE n."name" = o."timezone" LIMIT 1), 'Australia/Brisbane') AS "tz") z`;

/**
 * Run by the 15-minute job. `deadline` stops it claiming more once time is short: anything left
 * unclaimed is picked up next run, still inside the two-day window. Claimed work is always sent.
 */
export async function notifyDuePromoSteps(now = new Date(), force = false, deadline = Date.now() + 15_000) {
  const canPush = force || pushConfigured();
  const canMail = !!mailer();
  // Claiming without a way to deliver would lose the reminder, so with neither channel nothing is claimed.
  if (!canPush && !canMail) return 0;
  const digest = new Digest();
  const teams = new Map<string, string[]>();
  const teamOf = async (orgId: string) => teams.get(orgId) ?? teams.set(orgId, await teamUserIds(orgId)).get(orgId)!;
  let sent = 0;

  const releases = await prisma.release.findMany({
    where: {
      isPublic: true,
      releaseDate: { gte: new Date(now.getTime() - TO_MS), lte: new Date(now.getTime() + FROM_MS) },
    },
    select: {
      ...RELEASE_SELECT,
      promoDone: { select: { key: true } },
      promoReminders: { select: { key: true } },
      promoAssigns: { select: { key: true, assignee: true } },
    },
    take: 200,
  });

  for (const r of releases) {
    if (Date.now() > deadline) break;
    const done = new Set(r.promoDone.map((d) => d.key));
    const told = new Set(r.promoReminders.map((d) => d.key));
    const assigned = new Map(r.promoAssigns.filter((a) => isAssignee(a.assignee)).map((a) => [a.key, a.assignee as Assignee]));
    const steps = promoStepsFor(r.organization.kind === "artist" ? "artist" : "label", r.kind);
    const team = await teamOf(r.organizationId);
    const artist = artistLogin(r);
    // No row means "both", which is how every step worked before steps could be assigned.
    const recipients = (key: string) => {
      const who = reaches(assigned.get(key) ?? "both");
      return { team: who.team ? team : [], artist: who.artist && artist ? artist : null };
    };

    const due = steps.filter((s) => {
      if (done.has(s.key) || told.has(s.key)) return false;
      const when = stepDate(r.releaseDate, r.organization.timezone, s.day).getTime();
      if (!(when <= now.getTime() && when > now.getTime() - WINDOW_MS)) return false;
      // Only claim what can actually reach someone: an unassigned step is push-only, so with push
      // off it would be claimed and then sent nowhere, and that reminder would be gone for good.
      const to = recipients(s.key);
      if (!to.team.length && !to.artist) return false;
      return canPush || assigned.has(s.key);
    });
    if (!due.length) continue;

    // Claim every due step first. If two runs overlap, the loser's insert conflicts and it
    // sends nothing — the same "claim before you act" shape as the release-live push.
    const claimed: typeof due = [];
    for (const s of due) {
      try {
        await prisma.promoStepReminder.create({ data: { releaseId: r.id, key: s.key } });
        claimed.push(s);
      } catch {
        // Already claimed by another run.
      }
    }
    if (!claimed.length) continue;

    const forTeam = claimed.filter((s) => recipients(s.key).team.length);
    const forArtist = claimed.filter((s) => recipients(s.key).artist);
    if (canPush) {
      for (const [ids, list] of [[team, forTeam], [artist ? [artist] : [], forArtist]] as const) {
        if (!ids.length || !list.length) continue;
        const one = list.length === 1 ? list[0] : null;
        await sendPush([...ids], "promoPlan", {
          title: one ? `${one.title} — ${r.title}` : `${list.length} things to do for ${r.title}`,
          body: one ? one.body : list.map((s) => s.title).join(" · "),
          url: `/admin/releases/${r.id}?tab=promo`,
          artistUrl: `/dashboard#release-${r.id}`,
          tag: `promo-${r.id}`,
        });
        sent++;
      }
    }
    // Email only for steps someone assigned: an unassigned step reminds by push, as it always did,
    // so turning this on didn't start mailing every account seventeen times a release.
    for (const s of forTeam) if (assigned.has(s.key)) digest.add(team, "team", { releaseId: r.id, releaseTitle: r.title, title: s.title, body: s.body });
    for (const s of forArtist) if (assigned.has(s.key)) digest.add([artist!], "artist", { releaseId: r.id, releaseTitle: r.title, title: s.title, body: s.body });
  }

  sent += await notifyDueTasks(now, canPush, digest, teamOf, deadline);
  await digest.send();
  return sent;
}

/**
 * The label's own tasks. Candidates come from SQL, ordered by when they came due and limited to
 * the two-day window, so a large backlog of future or missed tasks can never crowd out today's.
 * Private releases count too: planning happens before a release goes public.
 */
async function notifyDueTasks(now: Date, canPush: boolean, digest: Digest, teamOf: (orgId: string) => Promise<string[]>, deadline: number) {
  const from = new Date(now.getTime() - WINDOW_MS).toISOString(), to = now.toISOString();
  const ids = await prisma.$queryRaw<{ id: string }[]>`
    SELECT t."id" FROM "ReleaseTask" t
    JOIN "Release" r ON r."id" = t."releaseId"
    JOIN "Organization" o ON o."id" = r."organizationId"
    ${TASK_ZONE_JOIN}
    WHERE t."doneAt" IS NULL AND t."remindedAt" IS NULL
      AND r."releaseDate" >= (${new Date(now.getTime() - TASK_SPAN_MS).toISOString()}::timestamptz AT TIME ZONE 'UTC')
      AND r."releaseDate" <= (${new Date(now.getTime() + TASK_SPAN_MS).toISOString()}::timestamptz AT TIME ZONE 'UTC')
      AND ${TASK_DUE_SQL} > ${from}::timestamptz AND ${TASK_DUE_SQL} <= ${to}::timestamptz
    ORDER BY ${TASK_DUE_SQL} ASC
    LIMIT 300`;
  if (!ids.length) return 0;
  const tasks = await prisma.releaseTask.findMany({
    where: { id: { in: ids.map((i) => i.id) } },
    select: { id: true, title: true, note: true, day: true, assignee: true, release: { select: RELEASE_SELECT } },
  });
  let sent = 0;
  for (const t of tasks) {
    if (Date.now() > deadline) break;
    const r = t.release;
    const when = stepDate(r.releaseDate, r.organization.timezone, t.day).getTime();
    if (!(when <= now.getTime() && when > now.getTime() - WINDOW_MS)) continue;
    const who = reaches(isAssignee(t.assignee) ? t.assignee : "label");
    const team = who.team ? await teamOf(r.organizationId) : [];
    const artist = who.artist ? artistLogin(r) : null;
    // Nobody to tell (an artist task on a release with no artist login): leave it unclaimed, so an
    // artist invited later today is still reminded.
    if (!team.length && !artist) continue;
    const claim = await prisma.releaseTask.updateMany({ where: { id: t.id, remindedAt: null, doneAt: null }, data: { remindedAt: now } });
    if (!claim.count) continue;
    const item = { releaseId: r.id, releaseTitle: r.title, title: t.title, body: t.note };
    if (canPush) {
      const msg = { title: `${t.title} — ${r.title}`, body: t.note ?? "Due today on the release plan.", url: `/admin/releases/${r.id}?tab=promo`, artistUrl: `/dashboard#release-${r.id}`, tag: `task-${t.id}` };
      await Promise.all([
        team.length ? sendPush(team, "promoPlan", msg).then(() => sent++) : null,
        artist ? sendPush([artist], "promoPlan", msg).then(() => sent++) : null,
      ]);
    }
    if (team.length) digest.add(team, "team", item);
    if (artist) digest.add([artist], "artist", item);
  }
  return sent;
}

export type DueWork = { releaseId: string; releaseTitle: string; artistName: string; key: string; title: string; due: Date; overdue: boolean; assignee: Assignee; custom: boolean };

/** What's due or overdue right now, for the label's dashboard. Read-only: never claims a reminder. */
export async function duePromoWork(organizationId: string, now = new Date()): Promise<DueWork[]> {
  const [releases, tasks] = await Promise.all([
    prisma.release.findMany({
      where: {
        organizationId,
        isPublic: true,
        releaseDate: { gte: new Date(now.getTime() - TO_MS), lte: new Date(now.getTime() + FROM_MS) },
      },
      select: {
        id: true,
        title: true,
        artistName: true,
        releaseDate: true,
        kind: true,
        organization: { select: { kind: true, timezone: true } },
        promoDone: { select: { key: true } },
        promoAssigns: { select: { key: true, assignee: true } },
      },
      orderBy: { releaseDate: "asc" },
      take: 25,
    }),
    // Tasks already due, newest first, picked in SQL so a long list of future tasks can't push
    // today's off the end of the page.
    prisma.$queryRaw<{ id: string }[]>`
      SELECT t."id" FROM "ReleaseTask" t
      JOIN "Release" r ON r."id" = t."releaseId"
      JOIN "Organization" o ON o."id" = r."organizationId"
      ${TASK_ZONE_JOIN}
      WHERE t."organizationId" = ${organizationId} AND r."organizationId" = ${organizationId} AND t."doneAt" IS NULL
        AND ${TASK_DUE_SQL} <= ${now.toISOString()}::timestamptz
        AND ${TASK_DUE_SQL} > ${new Date(now.getTime() - TASK_SPAN_MS).toISOString()}::timestamptz
      ORDER BY ${TASK_DUE_SQL} DESC
      LIMIT 200`.then((ids) =>
      prisma.releaseTask.findMany({
        where: { id: { in: ids.map((i) => i.id) } },
        select: { id: true, title: true, day: true, assignee: true, release: { select: { id: true, title: true, artistName: true, releaseDate: true, organization: { select: { timezone: true } } } } },
      }),
    ),
  ]);

  const out: DueWork[] = [];
  for (const r of releases) {
    const done = new Set(r.promoDone.map((d) => d.key));
    const assigned = new Map(r.promoAssigns.map((a) => [a.key, a.assignee]));
    for (const s of promoStepsFor(r.organization.kind === "artist" ? "artist" : "label", r.kind)) {
      if (done.has(s.key)) continue;
      const when = stepDate(r.releaseDate, r.organization.timezone, s.day);
      if (when.getTime() > now.getTime()) continue;
      const a = assigned.get(s.key);
      out.push({ releaseId: r.id, releaseTitle: r.title, artistName: r.artistName, key: s.key, title: s.title, due: when, overdue: when.getTime() < now.getTime() - 86_400_000, assignee: isAssignee(a) ? a : "both", custom: false });
    }
  }
  for (const t of tasks) {
    const when = stepDate(t.release.releaseDate, t.release.organization.timezone, t.day);
    if (when.getTime() > now.getTime()) continue;
    out.push({ releaseId: t.release.id, releaseTitle: t.release.title, artistName: t.release.artistName, key: `task:${t.id}`, title: t.title, due: when, overdue: when.getTime() < now.getTime() - 86_400_000, assignee: isAssignee(t.assignee) ? t.assignee : "label", custom: true });
  }
  return out.sort((a, b) => a.due.getTime() - b.due.getTime());
}
