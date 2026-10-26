import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { labelRelease } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { checkLyrics, LYRIC_LINE_MAX, LYRICS_MAX_LINES } from "@/lib/lyrics";

export const dynamic = "force-dynamic";

/**
 * Lines are capped twice on purpose. zod's caps stop an oversized body before anything is read
 * line by line; checkLyrics() then says which line is wrong, in a sentence the artist can act on.
 * The zod caps sit above checkLyrics' so the sentence is what the artist normally sees.
 */
const schema = z.object({
  lines: z.array(z.object({ text: z.string().max(LYRIC_LINE_MAX * 4), ms: z.number().nullable() })).max(LYRICS_MAX_LINES + 50),
  trackMs: z.number().nullable(),
});

/**
 * Replace a release's lyrics. The whole set every time: the editor holds all of it, and a
 * line-by-line API would be a second way for the order to go wrong. An empty list clears them,
 * and so does the length, because a length with no lyrics would say a track was timed when none was.
 *
 * Label side only, scoped by labelRelease() to the caller's own organisation. An artist reaching a
 * label's release through a roster link can make clips from these lyrics but not change them, the
 * same as every other field on a label's release.
 */
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await labelRelease(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Those lyrics couldn't be read. Reload the page and try again." }, { status: 400 });
  const checked = checkLyrics(parsed.data.lines, parsed.data.trackMs);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const empty = checked.lines.length === 0;
  const timed = checked.lines.some((l) => l.ms !== null);
  await prisma.release.update({
    where: { id: g.release.id },
    data: {
      lyrics: empty ? Prisma.DbNull : checked.lines,
      // Kept only while something is timed against it: untimed words don't belong to any file.
      lyricsTrackMs: timed ? parsed.data.trackMs : null,
    },
  });
  return NextResponse.json({ lines: checked.lines, trackMs: timed ? parsed.data.trackMs : null });
}
