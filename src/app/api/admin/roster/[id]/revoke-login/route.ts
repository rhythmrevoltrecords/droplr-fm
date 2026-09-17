import { NextResponse, type NextRequest } from "next/server";
import { labelArtistProfile } from "@/lib/admin-guard";
import { syncReleaseAccess } from "@/lib/artists";
import { prisma } from "@/lib/db";

/** Owner only: delete the artist's login. The profile and releases stay; the FK clears Artist.userId. */
export async function POST(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await labelArtistProfile(id, { ownerOnly: true });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!g.artist.userId) return NextResponse.json({ error: "This artist has no login" }, { status: 409 });
  // role: "artist" only, so a mislinked owner/admin account can never be deleted from here.
  const removed = await prisma.user.deleteMany({ where: { id: g.artist.userId, organizationId: g.user.organizationId, role: "artist" } });
  if (!removed.count) return NextResponse.json({ error: "That login isn't an artist account" }, { status: 409 });
  await syncReleaseAccess(g.artist.id);
  return NextResponse.json({ ok: true });
}
