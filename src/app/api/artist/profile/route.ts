import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { artistSelfInput, definedOnly, zodError } from "@/lib/artists";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Artist edits their own public-facing profile. Name, status, contacts, stats and notes stay label-only. */
export async function PATCH(req: NextRequest) {
  const user = await apiUser("any");
  if (!user || user.role !== "artist") return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const artist = await prisma.artist.findFirst({ where: { userId: user.id, organizationId: user.organizationId }, select: { id: true } });
  if (!artist) return NextResponse.json({ error: "Your label hasn't set up your profile yet" }, { status: 404 });
  const parsed = artistSelfInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: zodError(parsed.error) }, { status: 400 });

  const { socialLinks, ...rest } = parsed.data;
  const data: Prisma.ArtistUpdateInput = definedOnly(rest);
  if (socialLinks !== undefined) data.socialLinks = socialLinks ?? Prisma.DbNull;
  await prisma.artist.update({ where: { id: artist.id }, data });
  return NextResponse.json({ ok: true });
}
