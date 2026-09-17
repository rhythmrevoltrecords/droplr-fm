import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { labelArtistProfile } from "@/lib/admin-guard";
import { artistInput, definedOnly, zodError } from "@/lib/artists";
import { prisma } from "@/lib/db";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await labelArtistProfile(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const parsed = artistInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: zodError(parsed.error) }, { status: 400 });

  const { socialLinks, ...rest } = parsed.data;
  const data: Prisma.ArtistUpdateInput = definedOnly(rest);
  if (socialLinks !== undefined) data.socialLinks = socialLinks ?? Prisma.DbNull;
  // The editor sends every field on save: only a changed number counts as fresh stats.
  const statsChanged =
    (rest.monthlyListeners !== undefined && rest.monthlyListeners !== g.artist.monthlyListeners) ||
    (rest.followers !== undefined && rest.followers !== g.artist.followers);
  if (statsChanged) data.statsUpdatedAt = new Date();

  await prisma.artist.update({ where: { id: g.artist.id }, data });
  return NextResponse.json({ ok: true });
}

/** Owner only. Deletes the profile; releases stay (their artistProfileId is cleared by the FK). */
export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await labelArtistProfile(id, { ownerOnly: true });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  // Keeps it simple: a login without a profile would be invisible on the roster.
  if (g.artist.userId) return NextResponse.json({ error: "This artist still has a login. Remove their login first, then delete the profile." }, { status: 409 });
  await prisma.$transaction([
    prisma.invite.deleteMany({ where: { artistProfileId: g.artist.id, acceptedAt: null } }),
    prisma.artist.delete({ where: { id: g.artist.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
