import { NextResponse, type NextRequest } from "next/server";
import { labelRelease } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { parseTask } from "@/lib/release-tasks";

/**
 * PATCH { title?, note?, day?, assignee?, done? }: edit or tick one of the label's tasks.
 * DELETE: remove it. Neither needs a team plan: a task made on one keeps working after a downgrade.
 */
async function guard(props: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await props.params;
  const g = await labelRelease(id);
  if ("error" in g) return { fail: { error: g.error, status: g.status } };
  const task = await prisma.releaseTask.findFirst({ where: { id: taskId, releaseId: g.release.id }, select: { id: true, day: true, assignee: true } });
  if (!task) return { fail: { error: "Not found", status: 404 } };
  return { fail: null, user: g.user, task };
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string; taskId: string }> }) {
  const g = await guard(props);
  if (g.fail) return NextResponse.json({ error: g.fail.error }, { status: g.fail.status });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = parseTask(body, true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (body && "done" in body && typeof body.done !== "boolean") return NextResponse.json({ error: "done is true or false" }, { status: 400 });
  const data: Record<string, unknown> = { ...parsed.ok };
  // A new date or a new person is a new reminder.
  if ((parsed.ok.day !== undefined && parsed.ok.day !== g.task.day) || (parsed.ok.assignee !== undefined && parsed.ok.assignee !== g.task.assignee)) data.remindedAt = null;
  if (body && typeof body.done === "boolean") Object.assign(data, body.done ? { doneAt: new Date(), doneById: g.user.id } : { doneAt: null, doneById: null });
  const task = await prisma.releaseTask.update({ where: { id: g.task.id }, data, select: { id: true, title: true, note: true, day: true, assignee: true, doneAt: true } });
  return NextResponse.json({ ok: true, task });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string; taskId: string }> }) {
  const g = await guard(props);
  if (g.fail) return NextResponse.json({ error: g.fail.error }, { status: g.fail.status });
  await prisma.releaseTask.delete({ where: { id: g.task.id } });
  return NextResponse.json({ ok: true });
}
