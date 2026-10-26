import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** PATCH { on: boolean }: whether this login gets an email the day a task assigned to it comes due. */
export async function PATCH(req: NextRequest) {
  const user = await apiUser("any");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { on?: unknown };
  if (typeof b.on !== "boolean") return NextResponse.json({ error: "Send on: true or false" }, { status: 400 });
  await prisma.user.update({ where: { id: user.id }, data: { taskEmails: b.on } });
  return NextResponse.json({ ok: true, on: b.on });
}
