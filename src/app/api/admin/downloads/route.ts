import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { downloadLimitMessage, downloadLimitReached, downloadUrlProblem } from "@/lib/downloads";
import { resolveReleaseArtist } from "@/lib/artists";
import { RESERVED_SLUGS, slugify } from "@/lib/utils";
import { resolveGateSteps, stepsSchema } from "./steps";

const downloadSchema = z.object({
  title: z.string().min(1).max(200),
  artistName: z.string().min(1).max(200),
  coverUrl: z.string().url(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  slug: z.string().min(1).max(60),
  downloadUrl: z.string().min(1).max(2000),
  downloadNote: z.string().max(200).nullable().optional(),
  artistProfileId: z.string().max(40).nullable().optional(),
  isPublic: z.boolean().default(true),
  steps: stepsSchema,
});

/** Create a gated free download. Same table as a release, different front door. */
export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const parsed = downloadSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  }
  const d = parsed.data;

  // Downloads have their own rolling-12-month cap so a gate never eats a release slot.
  if (await downloadLimitReached(user.organizationId, user.organization.plan)) {
    return NextResponse.json({ error: downloadLimitMessage(user.organization.plan) }, { status: 402 });
  }

  const urlProblem = downloadUrlProblem(d.downloadUrl);
  if (urlProblem) return NextResponse.json({ error: urlProblem }, { status: 400 });

  const slug = slugify(d.slug);
  if (!slug || RESERVED_SLUGS.has(slug)) return NextResponse.json({ error: "That slug is reserved" }, { status: 400 });
  // Releases and downloads share one slug namespace because they share one public URL shape.
  if (await prisma.release.findUnique({ where: { slug } })) return NextResponse.json({ error: "Slug already taken — try adding the artist name" }, { status: 409 });
  if (await prisma.organization.findUnique({ where: { slug } })) return NextResponse.json({ error: "Slug clashes with a label name" }, { status: 409 });

  const steps = await resolveGateSteps(user.organizationId, d.steps);
  if ("error" in steps) return NextResponse.json({ error: steps.error }, { status: 400 });

  // An artist account attaches its own single profile, exactly as a release does, so a gate's
  // fans and stats land on the same artist page as their releases.
  let profileId = d.artistProfileId ?? null;
  if (user.organization.kind === "artist" && !profileId) {
    const own =
      (await prisma.artist.findFirst({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "asc" }, select: { id: true } })) ??
      (await prisma.artist.create({ data: { organizationId: user.organizationId, name: user.organization.name, email: user.email }, select: { id: true } }));
    profileId = own.id;
  }
  const assigned = await resolveReleaseArtist(user.organizationId, { artistProfileId: profileId });
  if (!assigned.ok || !assigned.data) return NextResponse.json({ error: assigned.error ?? "Artist not in your roster" }, { status: 400 });
  const artist = assigned.data;

  const created = await prisma.release.create({
    data: {
      organizationId: user.organizationId,
      kind: "download",
      title: d.title,
      artistName: d.artistName,
      coverUrl: d.coverUrl,
      accentColor: d.accentColor ?? null,
      slug,
      downloadUrl: d.downloadUrl.trim(),
      downloadNote: d.downloadNote ?? null,
      isPublic: d.isPublic,
      // A download has no release day. Now, so it sorts sensibly beside releases and the
      // existing "live" checks treat it as out rather than pending.
      releaseDate: new Date(),
      status: "live",
      artistProfileId: artist.artistProfileId,
      artistId: artist.artistId,
      gateSteps: { create: steps.steps },
    },
    select: { id: true, slug: true },
  });

  return NextResponse.json(created, { status: 201 });
}
