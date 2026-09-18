import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** POST { done: true } finishes (or skips) the walkthrough; { done: false } shows it again from Account. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { done?: unknown };
  await prisma.user.update({ where: { id: user.id }, data: { tourDoneAt: body.done === false ? null : new Date() } });
  return NextResponse.json({ ok: true });
}
