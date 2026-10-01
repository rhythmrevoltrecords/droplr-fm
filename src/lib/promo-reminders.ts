// "This is due today" pushes for the release promo plan. Run by the release-check job.
// Relative imports only: this is bundled into a Netlify function.
import { prisma } from "./db";
import { promoSteps, stepDate } from "./promo";
import { pushConfigured, sendPush, teamUserIds } from "./push";

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
const LAST_DAY = Math.max(...promoSteps("label").map((s) => s.day), ...promoSteps("artist").map((s) => s.day));
const FROM_MS = 45 * 86_400_000;
const TO_MS = LAST_DAY * 86_400_000 + WINDOW_MS;

export async function notifyDuePromoSteps(now = new Date(), force = false) {
  if (!force && !pushConfigured()) return 0;

  const releases = await prisma.release.findMany({
    where: {
      isPublic: true,
      releaseDate: { gte: new Date(now.getTime() - TO_MS), lte: new Date(now.getTime() + FROM_MS) },
    },
    select: {
      id: true,
      title: true,
      artistName: true,
      releaseDate: true,
      organizationId: true,
      artistId: true,
      organization: { select: { kind: true, timezone: true } },
      promoDone: { select: { key: true } },
      promoReminders: { select: { key: true } },
    },
    take: 200,
  });

  let sent = 0;
  for (const r of releases) {
    const done = new Set(r.promoDone.map((d) => d.key));
    const told = new Set(r.promoReminders.map((d) => d.key));
    const steps = promoSteps(r.organization.kind === "artist" ? "artist" : "label");

    const due = steps.filter((s) => {
      if (done.has(s.key) || told.has(s.key)) return false;
      const when = stepDate(r.releaseDate, r.organization.timezone, s.day).getTime();
      return when <= now.getTime() && when > now.getTime() - WINDOW_MS;
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

    const one = claimed.length === 1 ? claimed[0] : null;
    const audience = [...(await teamUserIds(r.organizationId)), ...(r.artistId ? [r.artistId] : [])];
    await sendPush(audience, "promoPlan", {
      title: one ? `${one.title} — ${r.title}` : `${claimed.length} things to do for ${r.title}`,
      body: one ? one.body : claimed.map((s) => s.title).join(" · "),
      url: `/admin/releases/${r.id}?tab=promo`,
      tag: `promo-${r.id}`,
    });
    sent++;
  }
  return sent;
}

/** What's due or overdue right now, for the dashboard. Read-only: never claims a reminder. */
export async function duePromoWork(organizationId: string, now = new Date()) {
  const releases = await prisma.release.findMany({
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
      organization: { select: { kind: true, timezone: true } },
      promoDone: { select: { key: true } },
    },
    orderBy: { releaseDate: "asc" },
    take: 25,
  });

  const out: { releaseId: string; releaseTitle: string; artistName: string; key: string; title: string; due: Date; overdue: boolean }[] = [];
  for (const r of releases) {
    const done = new Set(r.promoDone.map((d) => d.key));
    for (const s of promoSteps(r.organization.kind === "artist" ? "artist" : "label")) {
      if (done.has(s.key)) continue;
      const when = stepDate(r.releaseDate, r.organization.timezone, s.day);
      if (when.getTime() > now.getTime()) continue;
      out.push({
        releaseId: r.id,
        releaseTitle: r.title,
        artistName: r.artistName,
        key: s.key,
        title: s.title,
        due: when,
        overdue: when.getTime() < now.getTime() - 86_400_000,
      });
    }
  }
  return out.sort((a, b) => a.due.getTime() - b.due.getTime());
}
