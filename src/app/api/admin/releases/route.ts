import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resolveReleaseArtist } from "@/lib/artists";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normaliseIsrc, normaliseUpc } from "@/lib/odesli";
import { isPlatformKey, PLATFORMS } from "@/lib/platforms";
import { planOf, releaseWindowStart } from "@/lib/plans";
import { isReleased, zonedLocalToDate } from "@/lib/time";
import { RESERVED_SLUGS, slugify } from "@/lib/utils";

const schema = z.object({
  title: z.string().min(1).max(200),
  artistName: z.string().min(1).max(200),
  coverUrl: z.string().url(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  slug: z.string().min(1).max(60),
  releaseDateLocal: z.string().min(10), // Brisbane wall-clock
  artistProfileId: z.string().max(40).nullable().optional(),
  artistId: z.string().nullable().optional(), // legacy: a User id, mapped to that login's profile
  spotifyUrl: z.string().nullable().optional(),
  spotifyAlbumId: z.string().regex(/^[A-Za-z0-9]{22}$/).nullable().optional().or(z.literal("")),
  spotifyTrackId: z.string().regex(/^[A-Za-z0-9]{22}$/).nullable().optional().or(z.literal("")),
  spotifyArtistId: z.string().regex(/^[A-Za-z0-9]{22}$/).nullable().optional().or(z.literal("")),
  autoReResolve: z.boolean().default(true),
  upc: z.string().max(20).nullable().optional(),
  isrc: z.string().max(20).nullable().optional(),
  links: z.array(z.object({
    platform: z.string(),
    url: z.string().url(),
    title: z.string().max(60).nullable().optional(),
    buttonText: z.string().max(20).nullable().optional(),
    icon: z.string().max(2).nullable().optional(),
    visible: z.boolean().default(true),
  })).default([]),
});

export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  const d = parsed.data;

  const plan = planOf(user.organization.plan);
  // Counted over a rolling 12 months so older releases never have to be deleted (their links stay live).
  const count = await prisma.release.count({ where: { organizationId: user.organizationId, createdAt: { gte: releaseWindowStart() } } });
  if (count >= plan.releases) return NextResponse.json({ error: `${plan.name} allows ${plan.releases} new releases in any 12 months. Upgrade to add more; existing releases stay live.` }, { status: 402 });

  const slug = slugify(d.slug);
  if (!slug || RESERVED_SLUGS.has(slug)) return NextResponse.json({ error: "That slug is reserved" }, { status: 400 });
  if (await prisma.release.findUnique({ where: { slug } })) return NextResponse.json({ error: "Slug already taken — try adding the artist name" }, { status: 409 });
  if (await prisma.organization.findUnique({ where: { slug } })) return NextResponse.json({ error: "Slug clashes with a label name" }, { status: 409 });

  const assigned = await resolveReleaseArtist(user.organizationId, { artistProfileId: d.artistProfileId, artistId: d.artistId });
  if (!assigned.ok) return NextResponse.json({ error: assigned.error }, { status: 400 });
  const releaseDate = zonedLocalToDate(d.releaseDateLocal, user.organization.timezone);

  const release = await prisma.release.create({
    data: {
      organizationId: user.organizationId,
      artistId: assigned.data?.artistId ?? null,
      artistProfileId: assigned.data?.artistProfileId ?? null,
      slug,
      title: d.title,
      artistName: d.artistName,
      coverUrl: d.coverUrl,
      accentColor: d.accentColor ?? null,
      spotifyUrl: d.spotifyUrl || null,
      spotifyAlbumId: d.spotifyAlbumId || null,
      spotifyTrackId: d.spotifyTrackId || null,
      spotifyArtistId: d.spotifyArtistId || null,
      releaseDate,
      status: isReleased(releaseDate) ? "live" : "upcoming",
      autoReResolve: d.autoReResolve,
      resolvedAt: d.links.some((l) => l.platform === "appleMusic") && d.links.some((l) => l.platform === "deezer") ? new Date() : null,
      upc: normaliseUpc(d.upc),
      isrc: normaliseIsrc(d.isrc),
      links: {
        create: d.links
          .filter((l) => isPlatformKey(l.platform))
          .sort((a, b) => PLATFORMS[a.platform as keyof typeof PLATFORMS].weight - PLATFORMS[b.platform as keyof typeof PLATFORMS].weight)
          .map((l, i) => ({ platform: l.platform, url: l.url, title: l.title ?? null, buttonText: l.buttonText ?? null, icon: l.icon ?? null, visible: l.visible, isCustom: l.platform === "custom", position: i })),
      },
      linkVariants: { create: [{ slug: "ig", source: "instagram" }, { slug: "tiktok", source: "tiktok" }, { slug: "bio", source: "bio" }] },
    },
  });
  return NextResponse.json({ id: release.id });
}
