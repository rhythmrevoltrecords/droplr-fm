import { NextResponse, type NextRequest } from "next/server";
import { labelRelease } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { parseTask, TASK_LIMITS, type TaskInput } from "@/lib/release-tasks";
import { teamPlanning } from "@/lib/release-tasks-server";

/** POST { title, day, assignee?, note? }: add the label's own task to this release's plan. Team plans only. */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await labelRelease(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const org = await prisma.organization.findUnique({ where: { id: g.user.organizationId }, select: { kind: true, plan: true } });
  const tp = teamPlanning(org ?? { kind: null, plan: null });
  if (!tp.can) return NextResponse.json({ error: tp.why === "artist" ? "Tasks are for label accounts." : "Your own tasks are on the Pro and Label plans." }, { status: 402 });

  const parsed = parseTask(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const t = parsed.ok as TaskInput;
  // Lock the release row, count, insert: two adds at once queue on the lock, so the cap holds.
  const task = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Release" WHERE "id" = ${g.release.id} FOR UPDATE`;
    if ((await tx.releaseTask.count({ where: { releaseId: g.release.id } })) >= TASK_LIMITS.perRelease) return null;
    return tx.releaseTask.create({
      data: { releaseId: g.release.id, organizationId: g.release.organizationId, title: t.title, note: t.note ?? null, day: t.day, assignee: t.assignee },
      select: { id: true, title: true, note: true, day: true, assignee: true, doneAt: true },
    });
  });
  if (!task) return NextResponse.json({ error: `A release can hold ${TASK_LIMITS.perRelease} tasks.` }, { status: 400 });
  return NextResponse.json({ ok: true, task });
}
