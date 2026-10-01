import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateIp } from "./color";
import { prisma } from "./db";
import { SITE_URL } from "./env";
import { BRAND, button, esc, layout, muted, p, safeHex } from "./email-design";
import { sendBatch, emailConfigured } from "./email";
import { CONTACT } from "./legal";
import {
  acceptingEntries, checkEntryLink, deadlineText, DECLARATION_TEXT, DECLARATION_VERSION, duplicateMessage,
  duplicateVerdict, entryProblem, ENTRY_LIMITS, linkCheckFromStatus, type EntryWarning,
} from "./contest";
import { isEmail, normalizeEmail } from "./fan-import";

/**
 * The server half of remix contests. Everything that touches the database or the network lives here
 * so lib/contest.ts stays importable from a client component and from a test with no database.
 */

export const withdrawToken = () => randomBytes(18).toString("base64url");

// ---------------------------------------------------------------------------
// Taking an entry
// ---------------------------------------------------------------------------

export type EnterInput = {
  contestId: string;
  email: string;
  artistName: string;
  link: string;
  note?: string | null;
  declarationAccepted: boolean;
  ipHash?: string | null;
  country?: string | null;
};

export type EnterResult =
  | { ok: false; status: number; error: string }
  | { ok: true; entryId: string; revived: boolean; warnings: EntryWarning[] };

/**
 * Record one entry, or say precisely why not.
 *
 * Order matters and is not arbitrary: the window is checked before anything is validated, because
 * telling someone their link is malformed and *then* that entries closed yesterday is two rounds of
 * disappointment where one would do.
 */
export async function enterContest(input: EnterInput, now = new Date()): Promise<EnterResult> {
  const contest = await prisma.contest.findUnique({
    where: { id: input.contestId },
    select: {
      id: true, organizationId: true, published: true, opensAt: true, closesAt: true,
      winnerAnnouncedAt: true, maxPerEntrant: true, headline: true,
      release: { select: { id: true, title: true, artistName: true, slug: true, accentColor: true, isPublic: true } },
      organization: { select: { name: true, slug: true, accentColor: true, customDomain: true, plan: true, planUpdatedAt: true, customDomainLiveAt: true } },
    },
  });
  if (!contest || !contest.release.isPublic) return { ok: false, status: 404, error: "Not found" };
  if (!acceptingEntries(contest, now)) {
    return { ok: false, status: 409, error: "Entries aren't open for this one." };
  }

  const email = normalizeEmail(input.email);
  const artistName = input.artistName.trim();
  const note = input.note?.trim() || null;

  const problem = entryProblem({ email, artistName, link: input.link, declarationAccepted: input.declarationAccepted, note });
  if (problem) return { ok: false, status: 400, error: problem };
  if (!isEmail(email)) return { ok: false, status: 400, error: "Check that email address — we couldn't read it." };
  if (input.link.length > ENTRY_LIMITS.link) return { ok: false, status: 400, error: "That link is too long to be a link." };

  const linkResult = checkEntryLink(input.link, { closesAt: contest.closesAt, now });
  if (!linkResult.ok) return { ok: false, status: 400, error: linkResult.error };
  const { link, warnings } = linkResult;

  const existing = await prisma.contestEntry.findMany({
    where: { contestId: contest.id, OR: [{ linkNormalised: link.normalised }, { email }] },
    select: { id: true, email: true, linkNormalised: true, withdrawnAt: true },
  });
  const verdict = duplicateVerdict({ email, linkNormalised: link.normalised }, existing, contest.maxPerEntrant);
  const refusal = duplicateMessage(verdict, contest.maxPerEntrant);
  if (refusal) return { ok: false, status: 409, error: refusal };

  const data = {
    organizationId: contest.organizationId,
    contestId: contest.id,
    email,
    artistName,
    link: input.link.trim(),
    linkNormalised: link.normalised,
    linkHost: link.host,
    note,
    declarationVersion: DECLARATION_VERSION,
    declarationText: DECLARATION_TEXT,
    declarationAt: now,
    ipHash: input.ipHash ?? null,
    country: input.country ?? null,
  };

  let entryId: string;
  const revived = verdict.kind === "revive";
  try {
    if (verdict.kind === "revive") {
      // Additive only: the same person putting their own withdrawn entry back. Nothing about the row
      // changes except that it counts again — no link, no declaration, no judging mark is overwritten,
      // because an unverified email address is not authority to destroy anything.
      const row = await prisma.contestEntry.update({
        where: { id: verdict.entryId },
        data: { withdrawnAt: null },
        select: { id: true },
      });
      entryId = row.id;
    } else {
      const row = await prisma.contestEntry.create({
        data: { ...data, withdrawToken: withdrawToken() },
        select: { id: true },
      });
      entryId = row.id;
    }
  } catch (e) {
    // The unique index is the real guarantee; this is the race where two submits of one link arrive
    // together. Same answer as the checked case, so the entrant sees one consistent message.
    if ((e as { code?: string }).code === "P2002") {
      return { ok: false, status: 409, error: "That link has already been entered. If it was you, check your email for the confirmation." };
    }
    throw e;
  }

  // The unique index covers one link twice; nothing in the database covers one ADDRESS holding more
  // rows than the contest allows, so two simultaneous submissions with different links can both pass
  // the count above. Re-count after writing and undo the loser: the same insert-then-check shape
  // lib/throttle.ts uses, for the same reason.
  if (!revived) {
    const live = await prisma.contestEntry.count({ where: { contestId: contest.id, email, withdrawnAt: null } });
    if (live > contest.maxPerEntrant) {
      await prisma.contestEntry.delete({ where: { id: entryId } }).catch(() => {});
      return { ok: false, status: 409, error: duplicateMessage({ kind: "limit", count: live - 1 }, contest.maxPerEntrant)! };
    }
  }

  return { ok: true, entryId, revived, warnings };
}

// ---------------------------------------------------------------------------
// Is the link still there?
// ---------------------------------------------------------------------------

/**
 * HEAD the entry and record what came back.
 *
 * Deliberately forgiving: a host that refuses HEAD, a timeout, or a network error all leave the
 * entry "unchecked" rather than marking it broken. A false "this link is dead" on the label's
 * screen is worse than no check at all, because the label will believe it and skip the track.
 */
export async function checkEntryLinkReachable(entryId: string): Promise<void> {
  const entry = await prisma.contestEntry.findUnique({ where: { id: entryId }, select: { id: true, linkNormalised: true } });
  if (!entry) return;
  let result = "unchecked" as string;
  const url = await publicOnly(entry.linkNormalised);
  if (url) {
    try {
      const res = await fetch(url, {
        // manual, not follow: a public host could otherwise bounce this request to an internal
        // address after the check above passed. Same reasoning as lib/color.ts.
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: { "user-agent": "droplr.fm link check (+https://droplr.fm)" },
      });
      // Every file host redirects, and "manual" surfaces that as a 3xx rather than following it — so a
      // redirect still counts as "the thing is there", which is all this check claims to know.
      result = linkCheckFromStatus(res.status);
    } catch {
      result = "unchecked";
    }
  }
  await prisma.contestEntry
    .update({ where: { id: entry.id }, data: { linkCheck: result, linkCheckedAt: new Date() } })
    .catch(() => {});
}

/**
 * Resolve a URL and refuse anything that lands on a non-public address.
 *
 * This function is reachable by any anonymous visitor who submits an entry, so without it the enter
 * form is an SSRF probe: `http://169.254.169.254/`, `http://10.0.0.5/`, `http://[0:0:0:0:0:0:0:1]/`
 * and any public host that redirects to one of those. checkEntryLink's host rules reject the obvious
 * spellings and were never a security boundary — DNS resolution is.
 */
async function publicOnly(raw: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // https only. The address is checked here and then fetch() resolves the name again, so a hostile
  // DNS server (TTL 0) could answer public for the check and 10.x for the fetch. Over https that
  // second connection has to present a valid certificate for the attacker's name, which an internal
  // service can't — the same reason lib/color.ts is https-only. Plain-http links stay "unchecked",
  // which this check already treats as "don't know" rather than "broken".
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return null;
  return url;
}

// ---------------------------------------------------------------------------
// The entrant's receipt
// ---------------------------------------------------------------------------

/**
 * The confirmation email, which exists to do one job beyond politeness: hand the entrant a withdraw
 * link. Without it the only way out of a contest is emailing the label, and a contest an entrant
 * can't leave is not a contest they'll enter twice.
 *
 * It also repeats the warnings from the form. Someone who pasted a WeTransfer link and clicked
 * through the warning still has time to fix it, and this is where they'll see it again.
 *
 * The entrant's own link is shown as text, never as an anchor. This email goes to an address nobody
 * verified, carrying a label's name in the From line — so if it also carried a clickable URL the
 * sender chose, droplr would be a phishing relay wearing a customer's brand. The only link in here is
 * droplr's own withdraw URL.
 */
export function entryReceiptEmail(args: {
  contestHeadline: string;
  releaseTitle: string;
  orgName: string;
  accentColor: string | null;
  entryArtistName: string;
  link: string;
  closesAt: Date;
  timezone: string;
  withdrawUrl: string;
  warnings: EntryWarning[];
  showBranding: boolean;
}) {
  const accent = safeHex(args.accentColor);
  // Named zone, because this email goes to someone who may be nowhere near the label. See deadlineText.
  const closes = deadlineText(args.closesAt, args.timezone);

  const warningHtml = args.warnings.length
    ? `<div style="margin:0 0 20px;padding:14px 16px;border:1px solid ${BRAND.line};border-radius:10px;background:${BRAND.card}">
${args.warnings.map((w) => p(esc(w.message), `color:${BRAND.muted};font-size:14px`)).join("")}
<p style="margin:8px 0 0;color:${BRAND.faint};font:400 13px/1.5 system-ui">Fix it by withdrawing below and entering again with a better link.</p>
</div>`
    : "";

  return {
    subject: `You're in: ${args.contestHeadline}`,
    html: layout({
      preheader: `Your remix of ${args.releaseTitle} is entered.`,
      accent,
      brand: { name: args.orgName },
      body: `${p(`<strong style="color:${BRAND.text}">You're entered.</strong>`)}
${p(`${esc(args.orgName)} has your remix of <strong style="color:${BRAND.text}">${esc(args.releaseTitle)}</strong>, entered as ${esc(args.entryArtistName)}.`)}
${p(`<span style="color:${BRAND.muted}">Your link:</span><br/><span style="color:${BRAND.text};word-break:break-all">${esc(args.link)}</span>`)}
${p(`<span style="color:${BRAND.muted}">Entries close</span> ${esc(closes)}`)}
${warningHtml}
<div style="margin:24px 0">${button(args.withdrawUrl, "Withdraw my entry", accent)}</div>
${muted("Changed your mind, or pasted the wrong link? That button pulls your entry, and you can enter again with the right link while entries are still open. It&apos;s the only way to change what you sent, so keep this email.")}`,
      footer: args.showBranding
        ? `Sent because you entered a remix contest run by ${esc(args.orgName)}.<br/>Contest pages by <a href="${SITE_URL}" style="color:${BRAND.muted}">droplr.fm</a>`
        : `Sent because you entered a remix contest run by ${esc(args.orgName)}.`,
    }),
    text: `You're entered.\n\n${args.orgName} has your remix of ${args.releaseTitle}, entered as ${args.entryArtistName}.\n\nYour link: ${args.link}\nEntries close ${closes}\n\n${args.warnings.map((w) => `- ${w.message}`).join("\n")}\n\nWithdraw your entry: ${args.withdrawUrl}\n\nQuestions about the contest go to ${args.orgName}, not droplr. Trouble with the page: ${CONTACT.support}`,
  };
}

export async function sendEntryReceipt(to: string, orgName: string, msg: { subject: string; html: string; text: string }) {
  if (!emailConfigured()) return;
  await sendBatch([{ to, subject: msg.subject, html: msg.html, text: msg.text, fromName: orgName }]).catch((e) =>
    console.error("contest receipt failed", e),
  );
}
