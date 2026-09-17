import { NextResponse, type NextRequest } from "next/server";
import { artistLimitMessage, artistLimitReached } from "@/lib/artists";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createInvite } from "@/lib/invites";
import { planOf } from "@/lib/plans";

/** Invite an artist (or admin). Returns a link to share; no email provider required. */
export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const body = (await req.json()) as { email?: string; artistName?: string; role?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  const role = body.role === "admin" ? "admin" : "artist";
  const plan = planOf(user.organization.plan);
  if (role === "admin" && !plan.whiteLabel) return NextResponse.json({ error: "Team roles are on the Label plan" }, { status: 402 });
  // Accepting a generic artist invite creates a roster profile, so it needs a free seat now.
  if (role === "artist" && (await artistLimitReached(user.organizationId, user.organization.plan))) return NextResponse.json({ error: artistLimitMessage(user.organization.plan) }, { status: 402 });

  const r = await createInvite({ organizationId: user.organizationId, email, artistName: body.artistName, role });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ link: r.link });
}

export async function DELETE(req: NextRequest) {
  const user = await apiUser("label");
  if (!user || user.role !== "owner") return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const userId = req.nextUrl.searchParams.get("userId");
  const inviteId = req.nextUrl.searchParams.get("inviteId");
  if (inviteId) await prisma.invite.deleteMany({ where: { id: inviteId, organizationId: user.organizationId } });
  // Deleting an artist login clears Artist.userId and Release.artistId through their FKs (both SET NULL).
  if (userId && userId !== user.id) await prisma.user.deleteMany({ where: { id: userId, organizationId: user.organizationId, role: { not: "owner" } } });
  return NextResponse.json({ ok: true });
}
