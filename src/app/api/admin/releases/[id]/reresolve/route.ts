import { NextResponse, type NextRequest } from "next/server";
import { labelRelease } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { reResolveRelease } from "@/lib/presave-processor";

/** "Find store links" button: UPC/ISRC lookup now (Apple Music, Deezer, Spotify, TIDAL), same logic as the scheduled job. */
export async function POST(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await labelRelease(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const log: string[] = [];
  const added = await reResolveRelease(g.release.id, (m) => log.push(m));
  const fresh = await prisma.release.findUnique({ where: { id: g.release.id }, select: { upc: true, isrc: true } });
  const note = added
    ? log.join(" · ")
    : !fresh?.upc && !fresh?.isrc
      ? "Add the UPC or ISRC in Settings first (DistroKid shows both on the release page)."
      : "Nothing new found yet. Most stores only list a release once it's live (Apple Music pre-orders can appear earlier). droplr keeps checking daily before release and hourly after.";
  return NextResponse.json({ added, note, log });
}
