import { NextResponse } from "next/server";
import { apiUser, createSessionCookie, sessionCutoffNow } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** POST → sign out every other device (this browser gets a fresh session). */
export async function POST() {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.user.update({ where: { id: user.id }, data: { sessionsValidFrom: sessionCutoffNow() } });
  await createSessionCookie(user);
  return NextResponse.json({ ok: true });
}
