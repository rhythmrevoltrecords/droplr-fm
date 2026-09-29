import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { labelRelease } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { zonedLocalToDate } from "@/lib/time";

export const dynamic = "force-dynamic";

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

const schema = z.object({
  headline: z.string().trim().min(1, "Give it a name people will recognise").max(120),
  brief: z.string().trim().max(4000).nullable().optional(),
  prize: z.string().trim().max(500).nullable().optional(),
  rulesUrl: z.string().trim().url().max(500).nullable().optional().or(z.literal("").transform(() => null)),
  published: z.boolean(),
  /**
   * "2026-10-14T21:00" in the label's own timezone, like releaseDateLocal on the settings form.
   * The shape is checked here rather than downstream: zonedLocalToDate THROWS on anything that
   * doesn't match, so without this a typo is a 500 instead of a sentence the label can act on.
   */
  opensAtLocal: z.string().trim().regex(LOCAL_DATETIME, "Check the opening date.").nullable().optional().or(z.literal("").transform(() => null)),
  closesAtLocal: z.string().trim().regex(LOCAL_DATETIME, "Check the closing date."),
  winnerAnnouncedAtLocal: z.string().trim().regex(LOCAL_DATETIME, "Check the announcement date.").nullable().optional().or(z.literal("").transform(() => null)),
  maxPerEntrant: z.number().int().min(1).max(10),
});

/**
 * Create or update the contest on one release. Upsert on releaseId, because the release is the
 * contest's identity on the public page and a second one would make "which contest does this page
 * show?" ambiguous.
 *
 * `closesAt` arrives as an instant the client built from the label's own timezone — the same
 * contract Release.releaseDate has. A deadline that quietly means UTC is how a Brisbane label ends
 * up closing entries at 10am local.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const got = await labelRelease((await ctx.params).id);
  if ("error" in got) return NextResponse.json({ error: got.error }, { status: got.status });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the dates and try again." }, { status: 400 });
  }
  const d = parsed.data;
  const org = await prisma.organization.findUnique({
    where: { id: got.release.organizationId },
    select: { timezone: true, plan: true },
  });
  const tz = org?.timezone ?? null;

  // Gated on CREATING, never on running. A contest that went live and then the account downgraded
  // keeps taking entries and keeps its gallery — entrants were told the deadline, and breaking that
  // because the label's card expired would punish the wrong people. Same posture as releases, which
  // stay live past a downgrade. Editing an existing one is allowed for the same reason: a label on
  // Free still needs to be able to fix a typo in the brief or announce the winner.
  const existing = await prisma.contest.findUnique({ where: { releaseId: got.release.id }, select: { id: true } });
  if (!existing && !planOf(org?.plan).contests) {
    return NextResponse.json(
      { error: "Remix contests are on the paid plans. Upgrade and you can run one on any release." },
      { status: 402 },
    );
  }
  const closesAt = zonedLocalToDate(d.closesAtLocal, tz);
  const opensAt = d.opensAtLocal ? zonedLocalToDate(d.opensAtLocal, tz) : null;
  const announced = d.winnerAnnouncedAtLocal ? zonedLocalToDate(d.winnerAnnouncedAtLocal, tz) : null;
  if (opensAt && opensAt >= closesAt) {
    return NextResponse.json({ error: "It has to open before it closes." }, { status: 400 });
  }
  // contestState() checks the announcement first, so an announcement date inside the entry window
  // would flip the contest to "done" and make the form vanish while entries were meant to be open.
  if (announced && announced < closesAt) {
    return NextResponse.json({ error: "The winner can't be announced before entries close." }, { status: 400 });
  }

  const data = {
    headline: d.headline,
    brief: d.brief ?? null,
    prize: d.prize ?? null,
    rulesUrl: d.rulesUrl ?? null,
    published: d.published,
    opensAt,
    closesAt,
    winnerAnnouncedAt: announced,
    maxPerEntrant: d.maxPerEntrant,
  };

  const contest = await prisma.contest.upsert({
    where: { releaseId: got.release.id },
    create: { ...data, releaseId: got.release.id, organizationId: got.release.organizationId },
    update: data,
    select: { id: true, published: true },
  });
  return NextResponse.json({ ok: true, contest });
}

/**
 * Delete the contest, and with it every entry (cascade).
 *
 * Refused once anyone has entered. Entrants have a record saying they're in, and quietly deleting
 * that is worse than an awkward "you can't". Closing it and announcing nothing is the way out.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const got = await labelRelease((await ctx.params).id);
  if ("error" in got) return NextResponse.json({ error: got.error }, { status: got.status });

  const contest = await prisma.contest.findUnique({
    where: { releaseId: got.release.id },
    select: { id: true, _count: { select: { entries: true } } },
  });
  if (!contest) return NextResponse.json({ ok: true });
  if (contest._count.entries > 0) {
    return NextResponse.json(
      { error: `${contest._count.entries} ${contest._count.entries === 1 ? "person has" : "people have"} entered. Close it instead of deleting it — they've been told they're in.` },
      { status: 409 },
    );
  }
  await prisma.contest.delete({ where: { id: contest.id } });
  return NextResponse.json({ ok: true });
}
