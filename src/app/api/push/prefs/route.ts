import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PUSH_KINDS, type PushPrefs } from "@/lib/push";

export const dynamic = "force-dynamic";

/** PATCH { milestones?, releaseLive?, feedback?, referrals? } (booleans) → which notifications this login gets. */
export async function PATCH(req: NextRequest) {
  const user = await apiUser("any");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const prefs: PushPrefs = { ...((user.pushPrefs ?? {}) as PushPrefs) };
  for (const k of PUSH_KINDS) if (typeof b[k.key] === "boolean") prefs[k.key] = b[k.key] as boolean;
  await prisma.user.update({ where: { id: user.id }, data: { pushPrefs: prefs } });
  return NextResponse.json({ ok: true, prefs });
}
