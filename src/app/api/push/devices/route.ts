import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** DELETE { id } → remove one of your devices from the list (e.g. a lost phone). */
export async function DELETE(req: NextRequest) {
  const user = await apiUser("any");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (typeof b.id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });
  const r = await prisma.pushSubscription.deleteMany({ where: { id: b.id, userId: user.id } });
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
