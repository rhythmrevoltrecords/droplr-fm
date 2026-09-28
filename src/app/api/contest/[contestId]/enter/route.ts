import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { planOf } from "@/lib/plans";
import { checkEntryLinkReachable, enterContest, entryReceiptEmail, sendEntryReceipt } from "@/lib/contest-server";
import { ENTRY_LIMITS } from "@/lib/contest";
import { normalizeEmail } from "@/lib/fan-import";
import { allow, emailKey, ipKey } from "@/lib/throttle";
import { isBot, requestMeta } from "@/lib/tracking";

export const dynamic = "force-dynamic";

const body = z.object({
  email: z.string().trim().max(254),
  artistName: z.string().trim().max(ENTRY_LIMITS.artistName),
  link: z.string().trim().max(ENTRY_LIMITS.link),
  note: z.string().trim().max(ENTRY_LIMITS.note).nullable().optional(),
  declarationAccepted: z.boolean(),
});

/**
 * Take one contest entry.
 *
 * Throttled on two keys, because the two abuses are different shapes. Per-IP catches someone
 * scripting entries; per-address caps how often droplr will mail one person — the same 5-per-24-hours
 * the pre-save and gate email routes use, and for the same reason: this route sends a message under a
 * label's name to an address nobody verified, so the per-address budget is the anti-relay control.
 *
 * Both keys are scoped to "contest", not to one contest id. A per-contest budget resets every time the
 * caller picks a different contest, which makes it not a budget. Neither key holds a raw address or IP
 * — lib/throttle hashes both — and the address is normalised first, so "<a@b.com>" and "a@b.com" are
 * one bucket rather than two.
 *
 * The link check and the receipt both run in after(): a slow HEAD request to somebody's file host
 * must not be what decides whether the entrant sees "you're in".
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ contestId: string }> }) {
  const { contestId } = await ctx.params;
  if (isBot(req.headers.get("user-agent"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Fill in the form and try again." }, { status: 400 });

  const meta = requestMeta(req.headers);
  const ip = req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  if (!(await allow(ipKey("contest", ip), 10, 3_600_000))) {
    return NextResponse.json({ error: "That's a lot of entries from one place. Try again in an hour." }, { status: 429 });
  }
  const email = normalizeEmail(parsed.data.email);
  if (email && !(await allow(emailKey("contest", email), 5, 86_400_000))) {
    return NextResponse.json({ error: "We've already had a few from this address. Check your email — your entry is probably in." }, { status: 429 });
  }

  const result = await enterContest({
    contestId,
    ...parsed.data,
    ipHash: meta.ipHash,
    country: meta.country,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const entryId = result.entryId;
  after(async () => {
    await checkEntryLinkReachable(entryId).catch(() => {});
    const entry = await prisma.contestEntry
      .findUnique({
        where: { id: entryId },
        select: {
          email: true, artistName: true, link: true, withdrawToken: true,
          contest: {
            select: {
              headline: true, closesAt: true,
              release: { select: { title: true, artistName: true, slug: true, accentColor: true } },
              organization: { select: { name: true, slug: true, accentColor: true, customDomain: true, plan: true, planUpdatedAt: true, customDomainLiveAt: true, timezone: true } },
            },
          },
        },
      })
      .catch(() => null);
    if (!entry) return;
    const org = entry.contest.organization;
    await sendEntryReceipt(
      entry.email,
      org.name,
      entryReceiptEmail({
        contestHeadline: entry.contest.headline,
        releaseTitle: entry.contest.release.title,
        orgName: org.name,
        accentColor: entry.contest.release.accentColor ?? org.accentColor,
        entryArtistName: entry.artistName,
        link: entry.link,
        closesAt: entry.contest.closesAt,
        timezone: org.timezone,
        withdrawUrl: `${SITE_URL}/api/contest/withdraw/${entry.withdrawToken}`,
        warnings: result.warnings,
        showBranding: !planOf(org.plan).removeBranding,
      }),
    );
  });

  // `revived` is safe to report: it only ever means "your own withdrawn entry is back", and getting it
  // requires already knowing the exact link on that entry. The old `replaced` flag was an oracle for
  // "does this address hold a live entry?", which is nobody's business but the entrant's.
  return NextResponse.json({ ok: true, revived: result.revived, warnings: result.warnings });
}
