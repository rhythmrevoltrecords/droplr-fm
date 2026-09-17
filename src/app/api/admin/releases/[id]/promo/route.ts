import { NextResponse, type NextRequest } from "next/server";
import { labelRelease } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { promoSteps } from "@/lib/promo";

/** POST { key, done }: tick or untick a promo plan step. */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await labelRelease(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const body = (await req.json().catch(() => ({}))) as { key?: unknown; done?: unknown };
  if (typeof body.key !== "string" || !promoSteps("label").some((s) => s.key === body.key) || typeof body.done !== "boolean") {
    return NextResponse.json({ error: "Unknown step" }, { status: 400 });
  }
  if (body.done) await prisma.promoTaskDone.upsert({ where: { releaseId_key: { releaseId: g.release.id, key: body.key } }, create: { releaseId: g.release.id, key: body.key }, update: {} });
  else await prisma.promoTaskDone.deleteMany({ where: { releaseId: g.release.id, key: body.key } });
  return NextResponse.json({ ok: true });
}
