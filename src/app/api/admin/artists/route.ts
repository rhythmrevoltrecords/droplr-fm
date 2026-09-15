import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { randomToken, sha256 } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
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
  if (role === "artist") {
    const artists = await prisma.user.count({ where: { organizationId: user.organizationId, role: "artist" } });
    const pending = await prisma.invite.count({ where: { organizationId: user.organizationId, role: "artist", acceptedAt: null, expiresAt: { gt: new Date() } } });
    if (artists + pending >= plan.artists) return NextResponse.json({ error: `${plan.name} plan includes ${plan.artists} artist${plan.artists === 1 ? "" : "s"}. Upgrade for more.` }, { status: 402 });
  }
  if (await prisma.user.findUnique({ where: { email } })) return NextResponse.json({ error: "That email already has a droplr.fm account" }, { status: 409 });

  const token = randomToken(24);
  await prisma.invite.create({
    data: { organizationId: user.organizationId, email, artistName: body.artistName?.trim() || null, role, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 14 * 86400_000) },
  });
  return NextResponse.json({ link: `${SITE_URL}/invite/${token}` });
}

export async function DELETE(req: NextRequest) {
  const user = await apiUser("label");
  if (!user || user.role !== "owner") return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const userId = req.nextUrl.searchParams.get("userId");
  const inviteId = req.nextUrl.searchParams.get("inviteId");
  if (inviteId) await prisma.invite.deleteMany({ where: { id: inviteId, organizationId: user.organizationId } });
  if (userId && userId !== user.id) await prisma.user.deleteMany({ where: { id: userId, organizationId: user.organizationId, role: { not: "owner" } } });
  return NextResponse.json({ ok: true });
}
