import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { syncReleaseAccess } from "@/lib/artists";

/**
 * The artist accepts, or later ends, a roster link — from their own account.
 *
 * Accepting is the artist's decision, never the label's: a label can create the invitation but
 * cannot claim someone's account. The email on the invite has to match the signed-in account,
 * so a forwarded link can't be used by whoever receives it.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser("any");
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const invite = await prisma.invite.findUnique({ where: { tokenHash: sha256(token) } });
  if (!invite || invite.kind !== "link" || invite.acceptedAt || invite.expiresAt < new Date() || !invite.artistProfileId) {
    return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 400 });
  }
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "This invitation was sent to a different email address." }, { status: 403 });
  }
  if (invite.organizationId === user.organizationId) {
    return NextResponse.json({ error: "That's your own account." }, { status: 400 });
  }

  const artist = await prisma.artist.findFirst({ where: { id: invite.artistProfileId, organizationId: invite.organizationId } });
  if (!artist) return NextResponse.json({ error: "That roster profile no longer exists." }, { status: 404 });
  if (artist.userId) return NextResponse.json({ error: "That profile already has its own login." }, { status: 409 });

  await prisma.$transaction([
    prisma.artist.update({ where: { id: artist.id }, data: { linkedUserId: user.id, linkedAt: new Date() } }),
    prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);
  await syncReleaseAccess(artist.id);
  return NextResponse.redirect(new URL("/dashboard?linked=1", req.url), 303);
}

/** End a link from the artist's side. The label keeps its releases; the artist stops seeing them. */
export async function DELETE(req: NextRequest) {
  const user = await requireUser("any");
  const { artistProfileId } = (await req.json().catch(() => ({}))) as { artistProfileId?: string };
  if (!artistProfileId) return NextResponse.json({ error: "Missing profile" }, { status: 400 });
  const artist = await prisma.artist.findFirst({ where: { id: artistProfileId, linkedUserId: user.id }, select: { id: true } });
  if (!artist) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.artist.update({ where: { id: artist.id }, data: { linkedUserId: null, linkedAt: null } });
  await syncReleaseAccess(artist.id);
  return NextResponse.json({ ok: true });
}
