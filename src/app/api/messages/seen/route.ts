import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canDismiss } from "@/lib/platform-messages";

export const dynamic = "force-dynamic";

/**
 * POST { id } dismisses one dashboard notice for this login.
 *
 * Per login, not per organisation: two people share a label account and each has to read it
 * themselves. Idempotent, so a double-click or a retry is a no-op rather than an error.
 */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Same visibility rule as the banner, so this can't be used to dismiss — or probe for — a notice
  // written for somebody else.
  if (!(await canDismiss(user, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.platformMessageSeen.upsert({
    where: { messageId_userId: { messageId: id, userId: user.id } },
    create: { messageId: id, userId: user.id },
    update: {},
  });
  return NextResponse.json({ ok: true });
}
