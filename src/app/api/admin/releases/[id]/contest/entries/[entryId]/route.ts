import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { labelRelease } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { ENTRY_STATUSES } from "@/lib/contest";
import { checkEntryLinkReachable } from "@/lib/contest-server";

export const dynamic = "force-dynamic";

const schema = z.object({
  status: z.enum(ENTRY_STATUSES).optional(),
  labelNote: z.string().trim().max(2000).nullable().optional(),
  recheckLink: z.boolean().optional(),
});

/**
 * Judge one entry.
 *
 * Scoped twice on purpose: the release must belong to the caller's org, and the entry must belong to
 * that release's contest. Either check alone would be enough today; both together mean a future
 * refactor has to break two things before one label can touch another's entries.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await ctx.params;
  const got = await labelRelease(id);
  if ("error" in got) return NextResponse.json({ error: got.error }, { status: got.status });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const entry = await prisma.contestEntry.findFirst({
    where: { id: entryId, organizationId: got.release.organizationId, contest: { releaseId: got.release.id } },
    select: { id: true },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.recheckLink) {
    await checkEntryLinkReachable(entry.id);
  }
  const { status, labelNote } = parsed.data;
  if (status !== undefined || labelNote !== undefined) {
    await prisma.contestEntry.update({
      where: { id: entry.id },
      data: { ...(status !== undefined ? { status } : {}), ...(labelNote !== undefined ? { labelNote } : {}) },
    });
  }
  const fresh = await prisma.contestEntry.findUnique({
    where: { id: entry.id },
    select: { id: true, status: true, labelNote: true, linkCheck: true, linkCheckedAt: true },
  });
  return NextResponse.json({ ok: true, entry: fresh });
}
