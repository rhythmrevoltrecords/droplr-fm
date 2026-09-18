import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { labelRelease } from "@/lib/admin-guard";
import { resolveReleaseArtist } from "@/lib/artists";
import { prisma } from "@/lib/db";
import { normaliseIsrc, normaliseUpc } from "@/lib/odesli";
import { isReleased, zonedLocalToDate } from "@/lib/time";
import { RESERVED_SLUGS, slugify } from "@/lib/utils";

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  artistName: z.string().min(1).max(200).optional(),
  coverUrl: z.string().url().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  slug: z.string().min(1).max(60).optional(),
  releaseDateLocal: z.string().optional(),
  artistProfileId: z.string().max(40).nullable().optional(),
  artistId: z.string().nullable().optional(), // legacy: a User id, mapped to that login's profile
  spotifyAlbumId: z.string().regex(/^[A-Za-z0-9]{22}$/).nullable().optional().or(z.literal("")),
  spotifyTrackId: z.string().regex(/^[A-Za-z0-9]{22}$/).nullable().optional().or(z.literal("")),
  spotifyArtistId: z.string().regex(/^[A-Za-z0-9]{22}$/).nullable().optional().or(z.literal("")),
  upc: z.string().max(20).optional(),
  isrc: z.string().max(20).optional(),
  autoReResolve: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  rollout: z.enum(["local", "global"]).optional(),
  // Intent only: nothing is shared with anyone until the unreleased pool exists.
  poolOptIn: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await labelRelease(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const d = parsed.data;
  const data: Record<string, unknown> = {};
  for (const k of ["title", "artistName", "coverUrl", "accentColor", "autoReResolve", "isPublic", "rollout"] as const) if (d[k] !== undefined) data[k] = d[k];
  // Interest flag: stamp when it was ticked so we know who asked for the pool first.
  if (d.poolOptIn !== undefined) {
    data.poolOptIn = d.poolOptIn;
    data.poolOptInAt = d.poolOptIn ? new Date() : null;
  }
  for (const k of ["spotifyAlbumId", "spotifyTrackId", "spotifyArtistId"] as const) if (d[k] !== undefined) data[k] = d[k] || null;
  if (d.upc !== undefined) {
    if (d.upc && !normaliseUpc(d.upc)) return NextResponse.json({ error: "UPC should be 12–14 digits" }, { status: 400 });
    data.upc = normaliseUpc(d.upc);
  }
  if (d.isrc !== undefined) {
    if (d.isrc && !normaliseIsrc(d.isrc)) return NextResponse.json({ error: "ISRC should look like AUXXX2600001" }, { status: 400 });
    data.isrc = normaliseIsrc(d.isrc);
  }
  if ((d.upc !== undefined && normaliseUpc(d.upc) !== g.release.upc) || (d.isrc !== undefined && normaliseIsrc(d.isrc) !== g.release.isrc)) {
    data.resolvedAt = null; // new identifiers → let the job look again
  }
  if (d.slug !== undefined) {
    const slug = slugify(d.slug);
    if (!slug || RESERVED_SLUGS.has(slug)) return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    const clash = await prisma.release.findUnique({ where: { slug } });
    if (clash && clash.id !== g.release.id) return NextResponse.json({ error: "Slug taken" }, { status: 409 });
    data.slug = slug;
  }
  if (d.releaseDateLocal) {
    const rd = zonedLocalToDate(d.releaseDateLocal, g.user.organization.timezone);
    data.releaseDate = rd;
    data.status = isReleased(rd) ? g.release.status : "upcoming";
  }
  // artistId (login access) is always derived from the chosen profile.
  const assigned = await resolveReleaseArtist(g.user.organizationId, { artistProfileId: d.artistProfileId, artistId: d.artistId });
  if (!assigned.ok) return NextResponse.json({ error: assigned.error }, { status: 400 });
  if (assigned.data) Object.assign(data, assigned.data);
  await prisma.release.update({ where: { id: g.release.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await labelRelease(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  await prisma.release.delete({ where: { id: g.release.id } });
  return NextResponse.json({ ok: true });
}
