import { hasBeta } from "@/lib/beta";
import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** DELETE: remove an imported statement and everything calculated from it. Never gated. */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!hasBeta(user.organization, "royalties")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await props.params;
  const r = await prisma.statementImport.deleteMany({ where: { id, organizationId: user.organizationId } });
  if (!r.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
