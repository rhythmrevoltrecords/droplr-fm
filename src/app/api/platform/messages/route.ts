import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cleanMessage } from "@/lib/platform-messages";
import { platformAdmin } from "@/lib/platform";

export const dynamic = "force-dynamic";

/**
 * Writing and pulling dashboard notices. Platform admins only — `platformAdmin()` is the same
 * guard the rest of /platform uses, and it 404s rather than 403s so the console's existence isn't
 * confirmed to anyone else.
 *
 * POST   { body, title?, linkUrl?, linkLabel?, tone?, organizationId?, endsAt? }  writes one
 * PATCH  { id, revoked: true }                                                    pulls one
 *
 * A pulled message is kept, not deleted: "what did we tell people, and when" is worth more than a
 * tidy table, and the Terms lean on dashboard notices as a way of giving notice.
 */
export async function POST(req: Request) {
  const admin = await platformAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const clean = cleanMessage(b);
  if (!clean) return NextResponse.json({ error: "A message needs something in it" }, { status: 400 });

  // Explicit null = everyone. An unknown org id is rejected rather than quietly becoming a
  // broadcast, which is the one mistake in this feature that cannot be taken back.
  let organizationId: string | null = null;
  if (typeof b.organizationId === "string" && b.organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: b.organizationId }, select: { id: true } });
    if (!org) return NextResponse.json({ error: "No such account" }, { status: 400 });
    organizationId = org.id;
  }

  let endsAt: Date | null = null;
  if (typeof b.endsAt === "string" && b.endsAt) {
    const d = new Date(b.endsAt);
    if (!Number.isFinite(d.getTime())) return NextResponse.json({ error: "Bad end date" }, { status: 400 });
    endsAt = d;
  }

  const row = await prisma.platformMessage.create({
    data: { ...clean, organizationId, endsAt, createdBy: admin.email },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: row.id });
}

export async function PATCH(req: Request) {
  const admin = await platformAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const b = (await req.json().catch(() => ({}))) as { id?: unknown; revoked?: unknown };
  if (typeof b.id !== "string" || !b.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.platformMessage.update({
    where: { id: b.id },
    data: { revokedAt: b.revoked === false ? null : new Date() },
  });
  return NextResponse.json({ ok: true });
}
