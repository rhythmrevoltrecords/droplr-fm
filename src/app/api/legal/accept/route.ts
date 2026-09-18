import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LEGAL } from "@/lib/legal";

export const dynamic = "force-dynamic";

/** POST — this login accepts the current version of the Terms and the policies they refer to. */
export async function POST() {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.user.update({ where: { id: user.id }, data: { termsAcceptedAt: new Date(), termsVersion: LEGAL.version } });
  console.info("[legal] accepted", { user: user.id, version: LEGAL.version });
  return NextResponse.json({ ok: true, version: LEGAL.version });
}
