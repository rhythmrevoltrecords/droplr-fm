import { NextResponse, type NextRequest } from "next/server";
import { labelRelease } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { planOf } from "@/lib/plans";
import { publicReleaseUrl } from "@/lib/releases";
import { MILESTONES, renderShareImage, SHARE_FORMATS, type ShareFormat, type ShareKind } from "@/lib/share-image";
import { isReleased } from "@/lib/time";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET ?format=story|post&kind=countdown|out|milestone&n=100[&download=1]: a PNG for Instagram. */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await labelRelease(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const q = req.nextUrl.searchParams;
  const format = (q.get("format") ?? "story") as ShareFormat;
  const kind = (q.get("kind") ?? "countdown") as ShareKind;
  if (!(format in SHARE_FORMATS) || !["countdown", "out", "milestone"].includes(kind)) return NextResponse.json({ error: "Unknown format" }, { status: 400 });

  const release = await prisma.release.findUniqueOrThrow({ where: { id: g.release.id }, include: { organization: true } });
  let milestone: number | undefined;
  if (kind === "milestone") {
    // Only milestones the release has actually reached.
    const count = await prisma.preSave.count({ where: { releaseId: release.id } });
    milestone = Number(q.get("n"));
    if (!MILESTONES.includes(milestone) || milestone > count) return NextResponse.json({ error: "That milestone hasn't been reached yet" }, { status: 400 });
  }
  if (kind === "countdown" && isReleased(release.releaseDate)) return NextResponse.json({ error: "This release is already out" }, { status: 400 });

  const url = publicReleaseUrl(release.organization, release.slug, SITE_URL).replace(/^https?:\/\//, "");
  const img = await renderShareImage({
    format, kind, milestone, url,
    title: release.title, artistName: release.artistName, coverUrl: release.coverUrl, accentColor: release.accentColor ?? release.organization.accentColor,
    labelName: release.organization.name, releaseDate: release.releaseDate, timezone: release.organization.timezone,
    showBranding: !planOf(release.organization.plan).removeBranding,
  });
  const headers = new Headers(img.headers);
  headers.set("Cache-Control", "private, max-age=300");
  if (q.get("download") === "1") headers.set("Content-Disposition", `attachment; filename="${slugify(release.title) || "release"}-${kind}${milestone ? `-${milestone}` : ""}-${format}.png"`);
  return new Response(img.body, { status: 200, headers });
}
