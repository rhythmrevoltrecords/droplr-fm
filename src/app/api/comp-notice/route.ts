import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Acknowledge one of the complimentary-plan notices, so it stops appearing.
 *
 * Stamped with the value the notice was about (compSetAt for "granted", compUntil for "ended"),
 * not just "seen": a later comp has a newer compSetAt, so its own notice shows again.
 */
export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { kind?: unknown };
  if (body.kind !== "granted" && body.kind !== "ended") {
    return NextResponse.json({ error: "kind must be granted or ended" }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { id: true, compSetAt: true, compUntil: true },
  });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.organization.update({
    where: { id: org.id },
    data:
      body.kind === "granted"
        ? { compNoticeAt: org.compSetAt ?? new Date() }
        : { compEndedNoticeAt: org.compUntil ?? new Date() },
  });
  return NextResponse.json({ ok: true });
}
