import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { promoStepsFor } from "@/lib/promo";
import { isAssignee, reaches } from "@/lib/release-tasks";

/**
 * POST { releaseId, key, done }: an artist login ticks something on its own release's plan.
 * `key` is a promo step key, or "task:<id>" for one of the label's tasks. Only what was assigned to
 * the artist (or both) can be ticked here; the label's own work stays the label's.
 */
export async function POST(req: NextRequest) {
  const user = await apiUser("any");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role !== "artist") return NextResponse.json({ error: "Tick it on the release's Promo plan tab." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { releaseId?: unknown; key?: unknown; done?: unknown };
  if (typeof b.releaseId !== "string" || typeof b.key !== "string" || typeof b.done !== "boolean") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const release = await prisma.release.findFirst({
    where: { id: b.releaseId, organizationId: user.organizationId, OR: [{ artistId: user.id }, { artistProfile: { userId: user.id } }] },
    select: { id: true, kind: true, organization: { select: { kind: true } } },
  });
  if (!release) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (b.key.startsWith("task:")) {
    const task = await prisma.releaseTask.findFirst({ where: { id: b.key.slice(5), releaseId: release.id }, select: { id: true, assignee: true } });
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!isAssignee(task.assignee) || !reaches(task.assignee).artist) return NextResponse.json({ error: "That one is the label's." }, { status: 403 });
    await prisma.releaseTask.update({ where: { id: task.id }, data: b.done ? { doneAt: new Date(), doneById: user.id } : { doneAt: null, doneById: null } });
    return NextResponse.json({ ok: true });
  }

  if (!promoStepsFor(release.organization.kind === "artist" ? "artist" : "label", release.kind).some((s) => s.key === b.key)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const a = await prisma.promoStepAssign.findUnique({ where: { releaseId_key: { releaseId: release.id, key: b.key } }, select: { assignee: true } });
  if (!a || !isAssignee(a.assignee) || !reaches(a.assignee).artist) return NextResponse.json({ error: "That one is the label's." }, { status: 403 });
  if (b.done) await prisma.promoTaskDone.upsert({ where: { releaseId_key: { releaseId: release.id, key: b.key } }, create: { releaseId: release.id, key: b.key }, update: {} });
  else await prisma.promoTaskDone.deleteMany({ where: { releaseId: release.id, key: b.key } });
  return NextResponse.json({ ok: true });
}
