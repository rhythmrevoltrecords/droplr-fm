import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dismissSchema } from "@/lib/guides";

export const dynamic = "force-dynamic";

/**
 * POST { key } closes one guide card for this login, for good.
 *
 * Append-only and idempotent: there is no undo in the UI, so the route never removes a key, and
 * sending the same key twice is a no-op rather than a duplicate. The key is validated against the
 * config file's own union, so an unknown string is a 400 instead of a row of junk nobody will ever
 * clean up.
 */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = dismissSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Unknown guide" }, { status: 400 });

  const { key } = parsed.data;
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { guidesDismissed: true } });
  if (row && !row.guidesDismissed.includes(key)) {
    await prisma.user.update({ where: { id: user.id }, data: { guidesDismissed: { push: key } } });
  }
  return NextResponse.json({ ok: true });
}
