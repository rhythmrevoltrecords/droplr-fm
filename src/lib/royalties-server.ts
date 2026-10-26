import { createHash, randomBytes } from "node:crypto";
import { hasBeta } from "./beta";
import { prisma } from "./db";
import { accountEmailConfigured, accountEmailShell, sendAccountEmail } from "./account-email";
import { button, esc, muted, p } from "./email-design";
import { SITE_URL } from "./env";
import { planOf } from "./plans";
import { allocate, bpsToPercent, CONFIRM_TTL_MS, isCurrency, looksLikeUrl, normIsrc, normUpc, partyState, ROLE_LABEL, sheetConfirmed, SPLIT_LIMITS, type PartyInput, type Role, type StatementPair } from "./royalties";
import { emailKey, forget, hit } from "./throttle";

/** Label accounts on a plan with royalties. Gated on creating: a new sheet, a new collaborator, a new statement. */
export function royaltiesAllowed(org: { kind: string | null; plan: string | null; betaFeatures?: string[] | null }) {
  if (!hasBeta(org, "royalties")) return { can: false as const, why: "beta" as const };
  if (org.kind === "artist") return { can: false as const, why: "artist" as const };
  if (!planOf(org.plan).royalties) return { can: false as const, why: "plan" as const };
  return { can: true as const, why: null };
}

export const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");
/**
 * Who a statement is for, stable across releases so one collaborator gets one statement. Keyed
 * on the address when there is one — salted, because the key goes in URLs and an address must not.
 */
export const partyKeyOf = (pt: { id: string; email: string | null }) =>
  pt.email ? `e${createHash("sha256").update(`${process.env.JWT_SECRET ?? ""}|split|${pt.email}`).digest("hex").slice(0, 24)}` : `p${pt.id}`;


export async function sheetFor(releaseId: string, organizationId: string) {
  return prisma.splitSheet.findFirst({ where: { releaseId, organizationId }, include: { parties: { orderBy: { position: "asc" } } } });
}

/** Addresses on `next` that aren't on the sheet already. Adding one is a "create" for the plan gate. */
export async function newAddresses(releaseId: string, next: PartyInput[]) {
  const have = new Set((await prisma.splitParty.findMany({ where: { sheet: { releaseId } }, select: { email: true } })).map((x) => x.email).filter(Boolean));
  return next.filter((pt) => pt.email && !have.has(pt.email)).map((pt) => pt.email!);
}

/**
 * Save the whole sheet. Any change to who is on it or what they get is a new version, which
 * un-confirms everyone. A changed address also loses its link: the old one went to someone else.
 */
export async function saveSheet(release: { id: string; organizationId: string }, parties: PartyInput[]) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Release" WHERE "id" = ${release.id} FOR UPDATE`;
    const existing = await tx.splitSheet.findUnique({ where: { releaseId: release.id }, include: { parties: true } });
    if (!existing) {
      return tx.splitSheet.create({
        data: { releaseId: release.id, organizationId: release.organizationId, parties: { create: parties.map((pt, i) => ({ position: i, name: pt.name, email: pt.email, role: pt.role, shareBps: pt.shareBps })) } },
        include: { parties: { orderBy: { position: "asc" } } },
      });
    }
    const byId = new Map(existing.parties.map((x) => [x.id, x]));
    for (const pt of parties) if (pt.id && !byId.has(pt.id)) throw new Error("UNKNOWN_PARTY");
    const keep = new Set(parties.filter((pt) => pt.id).map((pt) => pt.id!));
    const changed =
      existing.parties.some((x) => !keep.has(x.id)) ||
      parties.some((pt) => { const x = pt.id ? byId.get(pt.id) : null; return !x || x.name !== pt.name || x.email !== pt.email || x.role !== pt.role || x.shareBps !== pt.shareBps; });
    const version = changed ? existing.version + 1 : existing.version;
    await tx.splitParty.deleteMany({ where: { sheetId: existing.id, id: { notIn: [...keep] } } });
    for (const [i, pt] of parties.entries()) {
      const x = pt.id ? byId.get(pt.id) : null;
      if (x) {
        await tx.splitParty.update({ where: { id: x.id }, data: { position: i, name: pt.name, email: pt.email, role: pt.role, shareBps: pt.shareBps, ...(x.email !== pt.email ? { tokenHash: null, tokenExpiresAt: null, sentAt: null, sentVersion: null } : {}) } });
      } else {
        await tx.splitParty.create({ data: { sheetId: existing.id, position: i, name: pt.name, email: pt.email, role: pt.role, shareBps: pt.shareBps } });
      }
    }
    return tx.splitSheet.update({ where: { id: existing.id }, data: { version }, include: { parties: { orderBy: { position: "asc" } } } });
  });
}

type Mail = { to: string; subject: string; html: string; text: string };
let testMailer: ((m: Mail) => Promise<void>) | null = null;
/** Tests only: capture split confirmation emails. */
export function setSplitMailerForTests(m: ((m: Mail) => Promise<void>) | null) { testMailer = m; }
const mailer = () => testMailer ?? (accountEmailConfigured() ? sendAccountEmail : null);

/**
 * Per account per day and per 30 days; per address per account per day; and per address across
 * every account per day, high enough that no single account can use up a collaborator's allowance.
 */
export const SEND_CAPS = { perAccountDay: 100, perAccountMonth: 500, perAddressDay: 3, perAddressAllDay: 10 };

export function splitEmail(a: { labelName: string; releaseTitle: string; artistName: string; partyName: string; share: string; url: string }) {
  // Neutral subject: anyone can name a free account anything, so the label's chosen name stays in the body.
  const subject = "Please confirm your share on a split sheet";
  const html = accountEmailShell("Confirm your share", `${p(`Hi ${esc(a.partyName)}. <strong>${esc(a.labelName)}</strong> has listed you on the split sheet for <strong>${esc(a.releaseTitle)}</strong> by ${esc(a.artistName)}, with a share of <strong>${esc(a.share)}%</strong>.`)}
${p("Open the sheet to see everyone's shares, then confirm it or say what's wrong.")}
<div style="margin:24px 0">${button(a.url, "Open the split sheet")}</div>
${muted("droplr.fm keeps track of who is owed what. It never holds or pays any money: the label pays you directly. If you don't know this label or this release, ignore this email, or open the link and say so.")}`);
  const text = `${subject}\n\n${a.labelName} has listed you (${a.partyName}) on the split sheet for ${a.releaseTitle} by ${a.artistName}, with a share of ${a.share}%.\n\nOpen it to confirm or say what's wrong:\n${a.url}\n\ndroplr.fm never holds or pays money: the label pays you directly.`;
  return { subject, html, text };
}

/**
 * Send the sheet to everyone who hasn't confirmed this version. Each gets a new link (the old one
 * stops working). The label's own share is confirmed by the team member sending it.
 */
export async function sendSheet(release: { id: string; organizationId: string; title: string; artistName: string; organization: { name: string } }) {
  const sheet = await sheetFor(release.id, release.organizationId);
  if (!sheet) return { error: "Save the split sheet first." };
  // These go into an email droplr sends to people who aren't customers. A name an email client turns
  // into a link is how a split sheet becomes a phishing message with droplr's name on it.
  for (const [what, v] of [["Your account name", release.organization.name], ["The release title", release.title], ["The artist name", release.artistName]] as const) {
    if (looksLikeUrl(v)) return { error: `${what} looks like a web address, so droplr won't put it in an email to someone else. Change it, then send.` };
  }
  const send = mailer();
  const now = new Date();
  let sent = 0, capped = 0;
  const failed: string[] = [];
  // Throttle records last a day (the privacy policy says so), so the 30-day limit has its own
  // append-only log: one row per email sent, holding no address, which deleting a party or a
  // sheet can't shrink. Rows older than 30 days are cleared as it goes.
  await prisma.splitSendLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * 86_400_000) } } });
  let month = await prisma.splitSendLog.count({ where: { organizationId: release.organizationId } });
  for (const pt of sheet.parties) {
    if (partyState(pt, sheet.version) === "confirmed") continue;
    if (!pt.email) {
      if (pt.role === "label") await prisma.splitParty.update({ where: { id: pt.id }, data: { confirmedVersion: sheet.version, confirmedAt: now, sentVersion: sheet.version } });
      continue;
    }
    if (!send) { failed.push(pt.name); continue; }
    if (month >= SEND_CAPS.perAccountMonth) { capped++; continue; }
    // Each cap is taken as a hit, and every hit is given back if any refuses: no gap between checking and recording.
    const taken: string[] = [];
    let ok = true;
    for (const [key, limit] of [
      [`split-send:org:${release.organizationId}`, SEND_CAPS.perAccountDay],
      [emailKey(`split-send:${release.organizationId}`, pt.email), SEND_CAPS.perAddressDay],
      [emailKey("split-send:all", pt.email), SEND_CAPS.perAddressAllDay],
    ] as const) {
      const h = await hit(key, limit, 86_400_000);
      taken.push(h.id);
      if (!h.ok) { ok = false; break; }
    }
    if (!ok) { await forget(taken); capped++; continue; }
    const token = randomBytes(24).toString("base64url");
    await prisma.splitParty.update({ where: { id: pt.id }, data: { tokenHash: tokenHash(token), tokenExpiresAt: new Date(now.getTime() + CONFIRM_TTL_MS), sentAt: now, sentVersion: sheet.version } });
    month++;
    await prisma.splitSendLog.create({ data: { organizationId: release.organizationId } });
    try {
      await send({ to: pt.email, ...splitEmail({ labelName: release.organization.name, releaseTitle: release.title, artistName: release.artistName, partyName: pt.name, share: bpsToPercent(pt.shareBps), url: `${SITE_URL}/split/${token}` }) });
      sent++;
    } catch (e) {
      console.error("[splits] send", e instanceof Error ? e.message : e);
      failed.push(pt.name);
    }
  }
  return { sent, capped, failed };
}

/** The party a confirmation link belongs to, if the link is live. */
export async function partyByToken(token: string) {
  if (!token || token.length > 100) return null;
  const pt = await prisma.splitParty.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { sheet: { include: { parties: { orderBy: { position: "asc" } }, release: { select: { title: true, artistName: true, coverUrl: true, organization: { select: { name: true, betaFeatures: true } } } } } } },
  });
  if (!pt || !pt.tokenExpiresAt || pt.tokenExpiresAt.getTime() < Date.now()) return null;
  // Switched off for the account: the link stops working, as if it had expired.
  if (!hasBeta(pt.sheet.release.organization, "royalties")) return null;
  return pt;
}

/**
 * Confirm or dispute the sheet as the link's holder saw it. `version` is the one the page showed:
 * if the label changed the sheet since, the answer is refused rather than applied to shares the
 * person never saw.
 */
export async function answerSheet(token: string, action: "confirm" | "dispute", version: number, note: string | null) {
  const pt = await partyByToken(token);
  if (!pt) return { error: "This link has expired or been replaced. Ask the label to send it again.", status: 404 };
  if (pt.sheet.version !== version) return { error: "The label changed the split sheet after you opened it. Reload the page to see the new one.", status: 409 };
  const now = new Date();
  const data = action === "confirm"
    ? { confirmedVersion: version, confirmedAt: now, disputedVersion: null, disputedAt: null, disputeNote: null }
    : { disputedVersion: version, disputedAt: now, disputeNote: note?.slice(0, SPLIT_LIMITS.dispute) || null, confirmedVersion: null, confirmedAt: null };
  // Applied only while the sheet is still at that version and the link is still this one.
  const res = await prisma.splitParty.updateMany({ where: { id: pt.id, tokenHash: pt.tokenHash, sheet: { version } }, data });
  if (!res.count) return { error: "The label changed the split sheet after you opened it. Reload the page to see the new one.", status: 409 };
  return { ok: true as const };
}

export type ImportInput = { title: string; currency: string; periodStart: Date | null; periodEnd: Date | null; rowsTotal: number; pairs: StatementPair[] };

/**
 * Match a statement's totals to the account's releases (by UPC, then ISRC), store a total per
 * release with its title, keep the biggest unmatched identifiers so the label can see what didn't
 * land, and work out what each party is owed.
 */
export async function createImport(organizationId: string, f: ImportInput) {
  if (!isCurrency(f.currency)) throw new Error("BAD_CURRENCY");
  const releases = await prisma.release.findMany({ where: { organizationId, kind: "release" }, select: { id: true, upc: true, isrc: true, title: true, artistName: true } });
  const titleOf = new Map(releases.map((r) => [r.id, `${r.title} · ${r.artistName}`]));
  const byUpc = new Map<string, string>(), byIsrc = new Map<string, string>();
  for (const r of releases) {
    const u = normUpc(r.upc), i = normIsrc(r.isrc);
    if (u && !byUpc.has(u)) byUpc.set(u, r.id);
    if (i && !byIsrc.has(i)) byIsrc.set(i, r.id);
  }
  const lines = new Map<string, { micros: bigint; rows: number }>();
  const unmatched: { upc: string; isrc: string; micros: bigint; rows: number }[] = [];
  let matchedMicros = 0n, unmatchedMicros = 0n, rowsMatched = 0;
  for (const pr of f.pairs) {
    const micros = BigInt(pr.micros);
    const id = (pr.upc && byUpc.get(normUpc(pr.upc))) || (pr.isrc && byIsrc.get(normIsrc(pr.isrc))) || null;
    if (id) {
      const e = lines.get(id) ?? { micros: 0n, rows: 0 };
      e.micros += micros; e.rows += pr.rows;
      lines.set(id, e);
      matchedMicros += micros; rowsMatched += pr.rows;
    } else {
      unmatched.push({ upc: pr.upc, isrc: pr.isrc, micros, rows: pr.rows });
      unmatchedMicros += micros;
    }
  }
  const abs = (n: bigint) => (n < 0n ? -n : n);
  unmatched.sort((a, b) => (abs(b.micros) > abs(a.micros) ? 1 : abs(b.micros) < abs(a.micros) ? -1 : 0));
  const imp = await prisma.statementImport.create({
    data: {
      organizationId, title: f.title, currency: f.currency, periodStart: f.periodStart, periodEnd: f.periodEnd,
      rowsTotal: f.rowsTotal, rowsMatched, matchedMicros, unmatchedMicros,
      unmatched: unmatched.slice(0, 100).map((u) => ({ upc: u.upc, isrc: u.isrc, micros: u.micros.toString(), rows: u.rows })),
      lines: { create: [...lines].map(([releaseId, e]) => ({ releaseId, releaseTitle: titleOf.get(releaseId) ?? "", amountMicros: e.micros, rows: e.rows })) },
    },
    select: { id: true },
  });
  await calculate(imp.id, organizationId);
  return imp.id;
}

/**
 * Work out each party's amount from each line of the statement, from the split sheets as they are
 * confirmed right now, and keep the result.
 *
 * A line whose release now has a fully confirmed sheet is worked out again. A line that can't be
 * (no sheet, a sheet someone hasn't confirmed, or a release since deleted) keeps whatever it was
 * last worked out as: an edit in progress never wipes figures a statement already showed. A line
 * that was never split stays unsplit, and the page says why: droplr says it can't tell rather
 * than guessing.
 *
 * Locked on the statement row, so two runs at once queue rather than both writing.
 */
export async function calculate(importId: string, organizationId: string) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "StatementImport" WHERE "id" = ${importId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    if (!locked.length) return null;
    const lines = await tx.statementLine.findMany({ where: { importId } });
    const ids = lines.map((l) => l.releaseId).filter((x): x is string => !!x);
    const sheets = await tx.splitSheet.findMany({ where: { organizationId, releaseId: { in: ids } }, include: { parties: { orderBy: { position: "asc" } } } });
    const sheetBy = new Map(sheets.map((s) => [s.releaseId, s]));
    const redo: string[] = [];
    const rows: { importId: string; lineId: string; releaseId: string; releaseTitle: string; partyId: string; partyKey: string; partyName: string; partyRole: string; shareBps: number; sheetVersion: number; amountMicros: bigint }[] = [];
    for (const l of lines) {
      const s = l.releaseId ? sheetBy.get(l.releaseId) : null;
      if (!s || !sheetConfirmed(s.parties, s.version)) continue;
      redo.push(l.id);
      // Ties in the rounding go by the sheet's own order, so working it out twice gives the same millionths.
      const shares = allocate(l.amountMicros, s.parties.map((pt) => ({ key: pt.id, bps: pt.shareBps })));
      for (const pt of s.parties) {
        rows.push({ importId, lineId: l.id, releaseId: l.releaseId!, releaseTitle: l.releaseTitle, partyId: pt.id, partyKey: partyKeyOf(pt), partyName: pt.name, partyRole: ROLE_LABEL[pt.role as Role] ?? pt.role, shareBps: pt.shareBps, sheetVersion: s.version, amountMicros: shares.get(pt.id) ?? 0n });
      }
    }
    await tx.statementAllocation.deleteMany({ where: { importId, lineId: { in: redo } } });
    if (rows.length) await tx.statementAllocation.createMany({ data: rows });
    await tx.statementImport.update({ where: { id: importId }, data: { calculatedAt: new Date() } });
    return rows.length;
  }, { timeout: 30_000, maxWait: 30_000 });
}
