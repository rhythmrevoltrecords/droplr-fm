import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { prefsPage } from "@/lib/email-prefs";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

/**
 * Pull an entry, from the link in the entrant's own receipt.
 *
 * **GET only asks; POST acts.** The unsubscribe route acts on GET and that is fine there, because
 * unsubscribing is harmless and reversible for 30 days. This isn't: withdrawing takes a track out of
 * a contest, and after the deadline it can't be undone. Mail gateways, link scanners and inbox
 * preview fetchers all follow GET links in email, so a GET that withdrew would silently pull entries
 * from people who never clicked anything.
 *
 * The row is kept and dated rather than deleted. That is what stops "withdraw, re-enter" being a way
 * around the per-entrant limit, and it keeps the link reserved so nobody else can enter someone
 * else's upload under their own name.
 *
 * `status` is deliberately left alone. It belongs to the label — an entry they marked `winner` that
 * the entrant then pulls is still the entry they picked, and rewriting it to `rejected` would erase
 * their decision. judgingSummary() already excludes withdrawn rows from every count.
 */
async function load(token: string) {
  if (!token || token.length > 64) return null;
  return prisma.contestEntry.findUnique({
    where: { withdrawToken: token },
    select: {
      id: true, artistName: true, link: true, withdrawnAt: true,
      contest: { select: { headline: true, closesAt: true, organization: { select: { name: true } } } },
    },
  });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const entry = await load(token);
  if (!entry) return prefsPage("<h1>Link expired</h1><p>This withdraw link isn't valid any more.</p>", 404);

  const org = esc(entry.contest.organization.name);
  if (entry.withdrawnAt) {
    const open = entry.contest.closesAt > new Date();
    return prefsPage(
      `<h1>Already withdrawn</h1><p>${org} isn't judging this entry.</p>
       ${open ? `<p style="color:#a1a1aa;font-size:14px;margin-top:28px">Changed your mind again? <a href="/api/contest/withdraw/${esc(token)}/undo" style="color:#fafafa">Put it back</a>.</p>` : ""}`,
    );
  }

  const closed = entry.contest.closesAt <= new Date();
  return prefsPage(
    `<h1>Withdraw your entry?</h1>
     <p>${esc(entry.artistName)} — ${esc(entry.link)}</p>
     <p style="color:#a1a1aa;font-size:14px">${org} won't judge it.${closed ? " Entries have closed, so this can't be undone." : " You can put it back, or enter again with a different link, while entries are open."}</p>
     <form method="post" action="/api/contest/withdraw/${esc(token)}" style="margin-top:28px">
       <button style="background:#fafafa;color:#09090b;border:0;border-radius:10px;padding:12px 20px;font:600 15px system-ui;cursor:pointer">Yes, withdraw it</button>
     </form>
     <p style="color:#71717a;font-size:13px;margin-top:16px">Nothing happens unless you press that.</p>`,
  );
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const entry = await load(token);
  if (!entry) return prefsPage("<h1>Link expired</h1><p>This withdraw link isn't valid any more.</p>", 404);

  const org = esc(entry.contest.organization.name);
  if (!entry.withdrawnAt) {
    await prisma.contestEntry.update({ where: { id: entry.id }, data: { withdrawnAt: new Date() } });
  }
  const open = entry.contest.closesAt > new Date();
  return prefsPage(
    `<h1>Your entry's withdrawn</h1>
     <p>${org} won't judge it. ${open ? "Entries are still open, so you can enter again with a different link." : "Entries have closed."}</p>
     ${open ? `<p style="color:#a1a1aa;font-size:14px;margin-top:28px">Didn't mean to? <a href="/api/contest/withdraw/${esc(token)}/undo" style="color:#fafafa">Put it back</a>.</p>` : ""}
     <p style="color:#71717a;font-size:13px;margin-top:12px">Questions about the contest itself go to ${org} — droplr just runs the page.</p>`,
  );
}
