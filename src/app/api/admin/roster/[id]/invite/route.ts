import { NextResponse, type NextRequest } from "next/server";
import { labelArtistProfile } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { createInvite } from "@/lib/invites";

/** "Invite to log in" for a roster profile. No plan check: the profile already holds a seat. */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await labelArtistProfile(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (g.artist.userId) return NextResponse.json({ error: "This artist already has a login" }, { status: 409 });
  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = (typeof body.email === "string" && body.email.trim() ? body.email : g.artist.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Add an email for this artist first" }, { status: 400 });

  // The link is shown once, so an older pending invite can't be re-shown: replace it rather than leave two live links.
  const previous = await prisma.invite.findMany({ where: { artistProfileId: g.artist.id, acceptedAt: null }, select: { id: true } });
  const r = await createInvite({ organizationId: g.user.organizationId, email, artistName: g.artist.name, role: "artist", artistProfileId: g.artist.id });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  if (previous.length) await prisma.invite.deleteMany({ where: { id: { in: previous.map((p) => p.id) }, organizationId: g.user.organizationId } });
  if (!g.artist.email) await prisma.artist.update({ where: { id: g.artist.id }, data: { email } });
  return NextResponse.json({ link: r.link });
}
