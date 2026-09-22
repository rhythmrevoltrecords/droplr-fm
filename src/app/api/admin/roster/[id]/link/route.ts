import { NextResponse, type NextRequest } from "next/server";
import { labelArtistProfile } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { UNVERIFIED_ERROR } from "@/lib/email-verification";
import { createInvite } from "@/lib/invites";
import { syncReleaseAccess } from "@/lib/artists";

/**
 * Link a roster profile to an artist's existing droplr account.
 *
 * Different from "Invite to log in", which creates a login inside the label's organisation.
 * This one is for the artist who already has their own account: they keep it, and they get read
 * access to the releases this label puts out under their name. Nothing is merged, and the label
 * gets nothing of theirs.
 *
 * Only the artist can complete it — this route just creates the invitation.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await labelArtistProfile(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!g.user.emailVerifiedAt) return NextResponse.json({ error: UNVERIFIED_ERROR }, { status: 403 });
  if (g.artist.userId) return NextResponse.json({ error: "This artist already has a login in your account." }, { status: 409 });
  if (g.artist.linkedUserId) return NextResponse.json({ error: "This artist is already linked to their own account." }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = (typeof body.email === "string" && body.email.trim() ? body.email : g.artist.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Add an email for this artist first" }, { status: 400 });

  // One live link at a time, same as the login invite: the token is shown once and an older
  // pending one could never be shown again.
  const previous = await prisma.invite.findMany({ where: { artistProfileId: g.artist.id, acceptedAt: null }, select: { id: true } });
  const r = await createInvite({ organizationId: g.user.organizationId, email, artistName: g.artist.name, role: "artist", artistProfileId: g.artist.id, kind: "link" });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  if (previous.length) await prisma.invite.deleteMany({ where: { id: { in: previous.map((p) => p.id) }, organizationId: g.user.organizationId } });
  if (!g.artist.email) await prisma.artist.update({ where: { id: g.artist.id }, data: { email } });
  return NextResponse.json({ link: r.link });
}

/** The label can end the link at any time. So can the artist, from their own dashboard. */
export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await labelArtistProfile(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!g.artist.linkedUserId) return NextResponse.json({ error: "Not linked" }, { status: 409 });
  await prisma.artist.update({ where: { id: g.artist.id }, data: { linkedUserId: null, linkedAt: null } });
  // Their releases stay with the label; only the artist's read access goes.
  await syncReleaseAccess(g.artist.id);
  return NextResponse.json({ ok: true });
}
