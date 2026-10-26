import { prisma } from "./db";
import { planOf } from "./plans";
import { promoStepsFor, stepDate } from "./promo";
import { findClashes, isAssignee, reaches, type Assignee, type Clash } from "./release-tasks";

/**
 * Release planning for teams: queries. Assigning and adding tasks needs a label account on a team
 * plan; everything already made keeps working after a downgrade (gate on creating, not serving).
 */
export function teamPlanning(org: { kind: string | null; plan: string | null }) {
  if (org.kind === "artist") return { can: false as const, why: "artist" as const };
  if (!planOf(org.plan).teamPlanning) return { can: false as const, why: "plan" as const };
  return { can: true as const, why: null };
}

/** The release's artist login inside this account, or null. A linked account on another label never counts: its access is read-only. */
export async function artistLoginOf(release: { id: string; organizationId: string }) {
  const r = await prisma.release.findUnique({
    where: { id: release.id },
    select: { artist: { select: { id: true, organizationId: true, email: true } }, artistProfile: { select: { user: { select: { id: true, organizationId: true, email: true } } } } },
  });
  const u = r?.artist ?? r?.artistProfile?.user ?? null;
  return u && u.organizationId === release.organizationId ? u : null;
}

/** Built-in step assignments and the label's own tasks on one release. */
export async function planExtras(releaseId: string) {
  const [assigns, tasks] = await Promise.all([
    prisma.promoStepAssign.findMany({ where: { releaseId }, select: { key: true, assignee: true } }),
    prisma.releaseTask.findMany({ where: { releaseId }, orderBy: [{ day: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, note: true, day: true, assignee: true, doneAt: true, doneBy: { select: { email: true, artistName: true } } } }),
  ]);
  return {
    assigned: new Map(assigns.filter((a) => isAssignee(a.assignee)).map((a) => [a.key, a.assignee as Assignee])),
    tasks: tasks.map((t) => ({ ...t, assignee: (isAssignee(t.assignee) ? t.assignee : "label") as Assignee })),
  };
}

/** Clashes for an account's releases within a window around `around` (default: now). */
export async function clashesFor(organizationId: string, tz: string, around = new Date(), spanDays = 400): Promise<Map<string, Clash[]>> {
  const span = spanDays * 86_400_000;
  const releases = await prisma.release.findMany({
    where: { organizationId, kind: "release", releaseDate: { gte: new Date(around.getTime() - span), lte: new Date(around.getTime() + span) } },
    select: { id: true, title: true, artistName: true, artistProfileId: true, releaseDate: true, kind: true },
    take: 1000,
  });
  return findClashes(releases, tz);
}

export type ArtistPlanItem = { releaseId: string; key: string; title: string; body: string | null; due: Date; done: boolean; custom: boolean };

/**
 * What an artist login has on its plate: built-in steps and tasks assigned to the artist (or both)
 * on its own releases in its own account. Steps nobody assigned stay off this list: they were
 * never the artist's to tick, and listing all seventeen would bury the ones that are.
 */
export async function artistPlan(user: { id: string; organizationId: string }, releaseIds: string[]) {
  if (!releaseIds.length) return new Map<string, ArtistPlanItem[]>();
  const releases = await prisma.release.findMany({
    where: { id: { in: releaseIds }, organizationId: user.organizationId },
    select: {
      id: true, releaseDate: true, kind: true,
      organization: { select: { kind: true, timezone: true } },
      promoAssigns: { select: { key: true, assignee: true } },
      promoDone: { select: { key: true } },
      tasks: { select: { id: true, title: true, note: true, day: true, assignee: true, doneAt: true } },
    },
  });
  const out = new Map<string, ArtistPlanItem[]>();
  for (const r of releases) {
    const tz = r.organization.timezone;
    const done = new Set(r.promoDone.map((d) => d.key));
    const steps = new Map(promoStepsFor(r.organization.kind === "artist" ? "artist" : "label", r.kind).map((s) => [s.key, s]));
    const items: ArtistPlanItem[] = [];
    for (const a of r.promoAssigns) {
      const s = steps.get(a.key);
      if (!s || !isAssignee(a.assignee) || !reaches(a.assignee).artist) continue;
      items.push({ releaseId: r.id, key: s.key, title: s.title, body: s.body, due: stepDate(r.releaseDate, tz, s.day), done: done.has(s.key), custom: false });
    }
    for (const t of r.tasks) {
      if (!isAssignee(t.assignee) || !reaches(t.assignee).artist) continue;
      items.push({ releaseId: r.id, key: `task:${t.id}`, title: t.title, body: t.note, due: stepDate(r.releaseDate, tz, t.day), done: !!t.doneAt, custom: true });
    }
    out.set(r.id, items.sort((a, b) => a.due.getTime() - b.due.getTime()));
  }
  return out;
}
