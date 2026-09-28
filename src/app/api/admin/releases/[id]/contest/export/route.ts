import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/lib/analytics";
import { labelRelease } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Entries as CSV — the judging spreadsheet, and the record of what each entrant agreed to.
 *
 * Not behind the paid csvExport flag that the analytics export uses. That flag gates a marketing
 * feature; this is the label's own evidence that a given person declared a given remix was theirs,
 * and putting that behind a plan would mean a downgrade takes away a record they may need.
 *
 * declarationText goes in every row rather than once at the top, because the wording can change
 * between entries and the per-row copy is the one that's true for that entrant.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const got = await labelRelease((await ctx.params).id);
  if ("error" in got) return NextResponse.json({ error: got.error }, { status: got.status });

  const contest = await prisma.contest.findUnique({ where: { releaseId: got.release.id }, select: { id: true } });
  if (!contest) return NextResponse.json({ error: "No contest on this release" }, { status: 404 });

  const rows = await prisma.contestEntry.findMany({
    where: { contestId: contest.id, organizationId: got.release.organizationId },
    orderBy: { createdAt: "asc" },
    take: 50_000,
  });

  const csv = toCsv(
    rows.map((r) => ({
      enteredAt: r.createdAt,
      artistName: r.artistName,
      email: r.email,
      link: r.link,
      host: r.linkHost ?? "",
      linkCheck: r.linkCheck,
      linkCheckedAt: r.linkCheckedAt,
      status: r.status,
      note: r.note ?? "",
      labelNote: r.labelNote ?? "",
      withdrawnAt: r.withdrawnAt,
      country: r.country ?? "",
      declarationVersion: r.declarationVersion,
      declarationAt: r.declarationAt,
      declarationText: r.declarationText,
    })),
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${got.release.slug}-contest-entries.csv"`,
      // Entrants' addresses: never cached by a proxy, never indexed.
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
