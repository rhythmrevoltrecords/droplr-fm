import { NextResponse, type NextRequest } from "next/server";
import { labelRelease } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { promoStepsFor } from "@/lib/promo";
import { isAssignee } from "@/lib/release-tasks";
import { teamPlanning } from "@/lib/release-tasks-server";

/**
 * POST { key, done }: tick or untick a promo plan step.
 * POST { key, assignee }: give the step to "label", "artist" or "both", or null to unassign it.
 * A new assignment needs a team plan; changing or removing one never does, so a downgraded account can always undo.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await labelRelease(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const body = (await req.json().catch(() => ({}))) as { key?: unknown; done?: unknown; assignee?: unknown };
  if (typeof body.key !== "string" || !promoStepsFor("label", g.release.kind).some((s) => s.key === body.key)) {
    return NextResponse.json({ error: "Unknown step" }, { status: 400 });
  }
  const key = body.key;

  if ("assignee" in body) {
    if (body.assignee === null) {
      await prisma.promoStepAssign.deleteMany({ where: { releaseId: g.release.id, key } });
      return NextResponse.json({ ok: true, assignee: null });
    }
    if (!isAssignee(body.assignee)) return NextResponse.json({ error: "Assign it to the label, the artist or both." }, { status: 400 });
    // Changing who an existing assignment is for is an edit, and edits are never gated.
    const existing = await prisma.promoStepAssign.findUnique({ where: { releaseId_key: { releaseId: g.release.id, key } }, select: { id: true } });
    const org = await prisma.organization.findUnique({ where: { id: g.user.organizationId }, select: { kind: true, plan: true } });
    const tp = teamPlanning(org ?? { kind: null, plan: null });
    if (!existing && !tp.can) return NextResponse.json({ error: tp.why === "artist" ? "Assigning steps is for label accounts." : "Assigning steps is on the Pro and Label plans." }, { status: 402 });
    const assignee = body.assignee;
    await prisma.promoStepAssign.upsert({ where: { releaseId_key: { releaseId: g.release.id, key } }, create: { releaseId: g.release.id, key, assignee }, update: { assignee } });
    return NextResponse.json({ ok: true, assignee });
  }

  if (typeof body.done !== "boolean") return NextResponse.json({ error: "Unknown step" }, { status: 400 });
  if (body.done) await prisma.promoTaskDone.upsert({ where: { releaseId_key: { releaseId: g.release.id, key } }, create: { releaseId: g.release.id, key }, update: {} });
  else await prisma.promoTaskDone.deleteMany({ where: { releaseId: g.release.id, key } });
  return NextResponse.json({ ok: true });
}
