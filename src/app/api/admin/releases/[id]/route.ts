import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { labelRelease } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { brisbaneLocalToDate, isReleased } from "@/lib/time";
import { RESERVED_SLUGS, slugify } from "@/lib/utils";

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  artistName: z.string().min(1).max(200).optional(),
  coverUrl: z.string().url().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  slug: z.string().min(1).max(60).optional(),
  releaseDateLocal: z.string().optional(),
  artistId: z.string().nullable().optional(),
  spotifyAlbumId: z.string().regex(/^[A-Za-z0-9]{22}$/).nullable().optional().or(z.literal("")),
  spotifyTrackId: z.string().regex(/^[A-Za-z0-9]{22}$/).nullable().optional().or(z.literal("")),
  spotifyArtistId: z.string().regex(/^[A-Za-z0-9]{22}$/).nullable().optional().or(z.literal("")),
  autoReResolve: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await labelRelease(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const d = parsed.data;
  const data: Record<string, unknown> = {};
  for (const k of ["title", "artistName", "coverUrl", "accentColor", "autoReResolve", "isPublic"] as const) if (d[k] !== undefined) data[k] = d[k];
  for (const k of ["spotifyAlbumId", "spotifyTrackId", "spotifyArtistId"] as const) if (d[k] !== undefined) data[k] = d[k] || null;
  if (d.slug !== undefined) {
    const slug = slugify(d.slug);
    if (!slug || RESERVED_SLUGS.has(slug)) return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    const clash = await prisma.release.findUnique({ where: { slug } });
    if (clash && clash.id !== g.release.id) return NextResponse.json({ error: "Slug taken" }, { status: 409 });
    data.slug = slug;
  }
  if (d.releaseDateLocal) {
    const rd = brisbaneLocalToDate(d.releaseDateLocal);
    data.releaseDate = rd;
    data.status = isReleased(rd) ? g.release.status : "upcoming";
  }
  if (d.artistId !== undefined) {
    if (d.artistId) {
      const a = await prisma.user.findFirst({ where: { id: d.artistId, organizationId: g.user.organizationId } });
      if (!a) return NextResponse.json({ error: "Artist not in roster" }, { status: 400 });
    }
    data.artistId = d.artistId || null;
  }
  await prisma.release.update({ where: { id: g.release.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const g = await labelRelease(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  await prisma.release.delete({ where: { id: g.release.id } });
  return NextResponse.json({ ok: true });
}
