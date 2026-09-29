import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { galleryVisible, voteVerdict } from "@/lib/contest";
import { allow, ipKey } from "@/lib/throttle";
import { ANON_COOKIE, isBot, requestMeta } from "@/lib/tracking";

export const dynamic = "force-dynamic";

const body = z.object({ entryId: z.string().min(1).max(40) });

/**
 * One public vote, or a moved one.
 *
 * Keyed on the anonymous visitor cookie the middleware already sets, with a unique index behind it, so
 * "one vote per visitor per contest" is a database rule rather than something this route has to
 * remember. A visitor with no cookie is refused rather than counted: without one there is no way to
 * tell a second vote from a second person, and an uncapped counter is worse than no counter.
 *
 * Only while the gallery is visible — which means only after entries close. Voting during the window
 * would reward whoever entered first with weeks of extra exposure.
 *
 * The response returns every count, not just the changed one, because a vote moving means two numbers
 * changed and the page shouldn't have to guess which.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ contestId: string }> }) {
  const { contestId } = await ctx.params;
  if (isBot(req.headers.get("user-agent"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const anonId = req.cookies.get(ANON_COOKIE)?.value ?? null;
  if (!anonId) {
    return NextResponse.json(
      { error: "Voting needs cookies on — otherwise there's no way to keep it to one vote each." },
      { status: 400 },
    );
  }

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const meta = requestMeta(req.headers);
  const ip = req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  // Generous, because moving a vote is a legitimate thing to do a few times while listening — but
  // finite, so one script can't manufacture a thousand cookie-less-looking visitors from one address.
  if (!(await allow(ipKey("contest:vote", ip), 60, 3_600_000))) {
    return NextResponse.json({ error: "That's a lot of voting from one place. Try again later." }, { status: 429 });
  }

  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      id: true, published: true, opensAt: true, closesAt: true, winnerAnnouncedAt: true,
      release: { select: { isPublic: true } },
    },
  });
  if (!contest || !contest.release.isPublic) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!galleryVisible(contest)) {
    return NextResponse.json({ error: "Voting opens when entries close." }, { status: 409 });
  }

  // The entry has to belong to this contest, be standing, and be one the public may see at all.
  const entry = await prisma.contestEntry.findFirst({
    where: { id: parsed.data.entryId, contestId: contest.id, withdrawnAt: null, declarationVersion: { gte: 2 } },
    select: { id: true },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await prisma.contestVote.findUnique({
    where: { contestId_anonId: { contestId: contest.id, anonId } },
    select: { id: true, entryId: true },
  });
  const verdict = voteVerdict(existing?.entryId ?? null, entry.id);

  if (verdict.kind === "new") {
    await prisma.contestVote
      .create({ data: { contestId: contest.id, entryId: entry.id, anonId, ipHash: meta.ipHash, country: meta.country } })
      // A race between two taps lands on the unique index; the vote is already there, which is the
      // outcome the visitor wanted anyway.
      .catch(() => {});
  } else if (verdict.kind === "moved") {
    await prisma.contestVote.update({
      where: { contestId_anonId: { contestId: contest.id, anonId } },
      data: { entryId: entry.id, ipHash: meta.ipHash, country: meta.country },
    });
  }

  const grouped = await prisma.contestVote.groupBy({
    by: ["entryId"],
    where: { contestId: contest.id },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.entryId] = g._count._all;

  const mine = await prisma.contestVote.findUnique({
    where: { contestId_anonId: { contestId: contest.id, anonId } },
    select: { entryId: true },
  });
  return NextResponse.json({ ok: true, counts, votedFor: mine?.entryId ?? null });
}
