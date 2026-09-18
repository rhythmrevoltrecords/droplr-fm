// Platform-owner signup invites: let people create an account (on the Free plan) while signups are closed.
import { accountEmailConfigured, accountEmailShell, sendAccountEmail } from "./account-email";
import { decrypt, encrypt, randomToken, sha256 } from "./crypto";
import { prisma } from "./db";
import { button, muted, p } from "./email-design";
import { SITE_URL } from "./env";
import { isAccountKind, type AccountKind } from "./plans";

export const isInviteCode = (c: unknown): c is string => typeof c === "string" && /^[A-Za-z0-9_-]{32}$/.test(c);
export const inviteUrl = (code: string) => `${SITE_URL}/signup?code=${code}`;
const DAY = 86_400_000;

export type InviteInput = { email?: string | null; kind?: string | null; maxUses?: number; expiresInDays?: number; note?: string | null };

/** Checks an owner's invite settings. Returns the cleaned values or an error. */
export function normaliseInvite(input: InviteInput): { ok: true; data: { email: string | null; kind: AccountKind | null; maxUses: number; expiresInDays: number; note: string | null } } | { ok: false; error: string } {
  const email = input.email ? input.email.trim().toLowerCase() : null;
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { ok: false, error: `Not an email address: ${input.email}` };
  const kind: AccountKind | null = isAccountKind(input.kind) ? input.kind : null;
  const maxUses = email ? 1 : Math.min(Math.max(Math.floor(input.maxUses ?? 10), 1), 500);
  const expiresInDays = Math.min(Math.max(Math.floor(input.expiresInDays ?? 14), 1), 180);
  const note = input.note?.trim().slice(0, 200) || null;
  return { ok: true, data: { email, kind, maxUses, expiresInDays, note } };
}

export async function createInvite(input: InviteInput, createdBy: string) {
  const n = normaliseInvite(input);
  if (!n.ok) return n;
  const code = randomToken(24); // 32 url-safe chars
  const invite = await prisma.signupInvite.create({
    data: {
      tokenHash: sha256(code), tokenEncrypted: encrypt(code),
      email: n.data.email, kind: n.data.kind,
      maxUses: n.data.maxUses, expiresAt: new Date(Date.now() + n.data.expiresInDays * DAY), note: n.data.note, createdBy,
    },
  });
  return { ok: true as const, invite, code, url: inviteUrl(code) };
}

export function inviteCodeOf(invite: { tokenEncrypted: string }) {
  try {
    return decrypt(invite.tokenEncrypted);
  } catch {
    return null;
  }
}

export type InviteState = "active" | "used" | "expired" | "revoked";
export function inviteState(i: { uses: number; maxUses: number; expiresAt: Date; revokedAt: Date | null }, now = new Date()): InviteState {
  if (i.revokedAt) return "revoked";
  if (i.uses >= i.maxUses) return "used";
  if (i.expiresAt <= now) return "expired";
  return "active";
}

/** A usable invite for this code (and email, when the invite is for one address). */
export async function findUsableInvite(code: unknown, email?: string | null) {
  if (!isInviteCode(code)) return { ok: false as const, reason: "invalid" as const };
  const invite = await prisma.signupInvite.findUnique({ where: { tokenHash: sha256(code) } });
  if (!invite) return { ok: false as const, reason: "invalid" as const };
  const state = inviteState(invite);
  if (state !== "active") return { ok: false as const, reason: state, invite };
  if (email && invite.email && invite.email !== email.trim().toLowerCase()) return { ok: false as const, reason: "email" as const, invite };
  return { ok: true as const, invite };
}

/** Claim one use atomically (two people racing for the last use of an open link can't both get it). */
export async function claimInvite(inviteId: string) {
  const r = await prisma.signupInvite.updateMany({
    where: { id: inviteId, revokedAt: null, expiresAt: { gt: new Date() }, uses: { lt: prisma.signupInvite.fields.maxUses } },
    data: { uses: { increment: 1 }, lastUsedAt: new Date() },
  });
  return r.count === 1;
}

export function inviteEmail(url: string, opts: { expiresAt: Date }) {
  const until = opts.expiresAt.toLocaleDateString("en-AU", { day: "numeric", month: "long" });
  return {
    subject: "You're invited to droplr.fm",
    html: accountEmailShell(
      "You're invited to droplr.fm",
      `${p("droplr.fm is invite-only while we onboard our first artists and labels, and here's your spot: pre-save pages, a fan list, promo plans and release-day emails in each fan's timezone.")}
<div style="margin:24px 0">${button(url, "Create my account")}</div>
${muted(`This link works until ${until}. Your account starts on the Free plan with no card needed, and you can upgrade whenever you like.`)}`,
    ),
    text: `You're invited to droplr.fm.\n\nCreate your account (link works until ${until}; starts on the Free plan, no card):\n${url}`,
  };
}

export async function sendInviteEmail(invite: { id: string; email: string | null; expiresAt: Date }, url: string) {
  if (!invite.email || !accountEmailConfigured()) return false;
  await sendAccountEmail({ to: invite.email, ...inviteEmail(url, invite) });
  await prisma.signupInvite.update({ where: { id: invite.id }, data: { emailedAt: new Date() } });
  return true;
}
