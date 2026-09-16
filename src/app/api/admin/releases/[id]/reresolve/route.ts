import { NextResponse, type NextRequest } from "next/server";
import { labelRelease } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { reResolveRelease } from "@/lib/presave-processor";

/** "Find Apple Music & Deezer" button: UPC/ISRC lookup now, same logic as the release-day job. */
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const g = await labelRelease(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const log: string[] = [];
  const added = await reResolveRelease(g.release.id, (m) => log.push(m));
  const fresh = await prisma.release.findUnique({ where: { id: g.release.id }, select: { upc: true, isrc: true } });
  const note = added
    ? log.join(" · ")
    : !fresh?.upc && !fresh?.isrc
      ? "Add the UPC or ISRC in Settings first (DistroKid shows both on the release page)."
      : "Nothing new found. Apple Music and Deezer only list a release once it's live, and it can take a few hours.";
  return NextResponse.json({ added, note, log });
}
