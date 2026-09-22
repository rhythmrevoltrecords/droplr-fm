import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiUser, isLabelRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { downloadUrlProblem } from "@/lib/downloads";
import { resolveGateSteps, stepsSchema } from "../steps";

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  artistName: z.string().min(1).max(200).optional(),
  coverUrl: z.string().url().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  downloadUrl: z.string().min(1).max(2000).optional(),
  downloadNote: z.string().max(200).nullable().optional(),
  isPublic: z.boolean().optional(),
  steps: stepsSchema.optional(),
});

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { id } = await props.params;

  // Scoped to the caller's org, and for an artist login to its own releases — the same idiom
  // every other release route uses, so a gate can't be reached by guessing an id.
  const existing = await prisma.release.findFirst({
    where: { id, organizationId: user.organizationId, kind: "download", ...(isLabelRole(user.role) ? {} : { artistId: user.id }) },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  }
  const d = parsed.data;

  if (d.downloadUrl !== undefined) {
    const problem = downloadUrlProblem(d.downloadUrl);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  // Steps are replaced wholesale, like release links. Progress is recorded per platform rather
  // than per step id, so re-ordering or re-saving a gate never strands someone half-way through.
  let steps: Awaited<ReturnType<typeof resolveGateSteps>> | null = null;
  if (d.steps) {
    steps = await resolveGateSteps(user.organizationId, d.steps);
    if ("error" in steps) return NextResponse.json({ error: steps.error }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.release.update({
      where: { id },
      data: {
        ...(d.title !== undefined && { title: d.title }),
        ...(d.artistName !== undefined && { artistName: d.artistName }),
        ...(d.coverUrl !== undefined && { coverUrl: d.coverUrl }),
        ...(d.accentColor !== undefined && { accentColor: d.accentColor }),
        ...(d.downloadUrl !== undefined && { downloadUrl: d.downloadUrl.trim() }),
        ...(d.downloadNote !== undefined && { downloadNote: d.downloadNote }),
        ...(d.isPublic !== undefined && { isPublic: d.isPublic }),
      },
    });
    if (steps && "steps" in steps) {
      await tx.gateStep.deleteMany({ where: { releaseId: id } });
      if (steps.steps.length) await tx.gateStep.createMany({ data: steps.steps.map((s) => ({ ...s, releaseId: id })) });
    }
  });

  return NextResponse.json({ ok: true });
}
