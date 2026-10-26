import { hasBeta } from "@/lib/beta";
import { NextResponse, type NextRequest } from "next/server";
import { labelRelease } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { sendSheet } from "@/lib/royalties-server";

/** POST: email everyone who hasn't confirmed this version of the sheet a link to confirm it. */
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await labelRelease(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!hasBeta(g.user.organization, "royalties")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const org = await prisma.organization.findUnique({ where: { id: g.user.organizationId }, select: { name: true } });
  const r = await sendSheet({ ...g.release, organization: { name: org?.name ?? "" } });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, ...r });
}
