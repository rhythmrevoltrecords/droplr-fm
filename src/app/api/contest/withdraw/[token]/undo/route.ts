import { type NextRequest } from "next/server";
import { withdrawTokenHash } from "@/lib/contest-server";
import { prisma } from "@/lib/db";
import { prefsPage } from "@/lib/email-prefs";
import { acceptingEntries } from "@/lib/contest";

export const dynamic = "force-dynamic";

/**
 * Undo a withdrawal, for someone who pulled an entry they meant to keep.
 *
 * Two guards, and the second one is the non-obvious one:
 *
 *  - **Only while entries are open.** Reinstating after the deadline would let someone withdraw,
 *    watch the shortlist, and reappear, with nothing in the label's list showing the entry had been out.
 *  - **Only if it doesn't put them over the limit.** A withdrawn entry frees its slot, which is
 *    correct — but without this check the slot gets spent on a new entry and then handed back:
 *    withdraw, enter a second link, undo, and a one-entry contest holds two live entries from one
 *    person. Repeat for as many as you like.
 *
 * `status` is left as the label set it. Someone who withdrew a shortlisted entry by mistake gets their
 * shortlist mark back, because the label's judgement didn't change — only the entrant's mind did.
 */
async function checked(token: string) {
  const entry = !token || token.length > 64 ? null : await prisma.contestEntry.findUnique({
    where: { withdrawTokenHash: withdrawTokenHash(token) },
    select: {
      id: true, email: true, contestId: true, withdrawnAt: true,
      contest: {
        select: {
          published: true, opensAt: true, closesAt: true, winnerAnnouncedAt: true, maxPerEntrant: true,
          organization: { select: { name: true } },
        },
      },
    },
  });
  if (!entry) return { page: prefsPage("<h1>Link expired</h1><p>This link isn't valid any more.</p>", 404) };
  if (!entry.withdrawnAt) return { page: prefsPage("<h1>You're still in</h1><p>That entry was never withdrawn.</p>") };
  if (!acceptingEntries(entry.contest)) {
    return { page: prefsPage("<h1>Entries have closed</h1><p>Your entry can't be put back after the deadline. Get in touch with the label if this was a mistake.</p>", 409) };
  }

  const live = await prisma.contestEntry.count({
    where: { contestId: entry.contestId, email: entry.email, withdrawnAt: null },
  });
  if (live >= entry.contest.maxPerEntrant) {
    return {
      page: prefsPage(
        `<h1>You're already entered</h1><p>You have ${live === 1 ? "an entry" : `${live} entries`} standing, which is the limit for this one. Withdraw one of those if you'd rather have this one judged instead.</p>`,
        409,
      ),
    };
  }
  return { entry };
}

/**
 * GET only asks; POST acts. Mail gateways and link scanners follow every GET in an email, so a GET
 * that changed state would let a scanner put an entry back that the entrant had pulled. Same rule as
 * withdraw itself and the unsubscribe links.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await checked(token);
  if (r.page) return r.page;
  return prefsPage(
    `<h1>Put your entry back in?</h1>
     <form method="post" style="margin-top:28px">
       <button style="background:#fafafa;color:#09090b;border:0;border-radius:10px;padding:12px 20px;font:600 15px system-ui;cursor:pointer">Yes, put it back</button>
     </form>
     <p style="color:#71717a;font-size:13px;margin-top:16px">Nothing happens unless you press that.</p>`,
  );
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await checked(token);
  if (r.page) return r.page;
  await prisma.contestEntry.update({ where: { id: r.entry.id }, data: { withdrawnAt: null } });
  return prefsPage("<h1>You're back in</h1><p>Your entry is standing again and will be judged with the rest.</p>");
}
