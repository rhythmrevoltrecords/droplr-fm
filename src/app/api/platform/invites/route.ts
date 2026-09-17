import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { platformAdmin } from "@/lib/platform";
import { createInvite, sendInviteEmail } from "@/lib/signup-invites";

export const dynamic = "force-dynamic";

type Body = { emails?: unknown; open?: unknown; kind?: unknown; maxUses?: unknown; expiresInDays?: unknown; note?: unknown; sendEmail?: unknown };

/**
 * POST — platform owner creates signup invites.
 *   { emails: "a@x.com\nb@y.com", sendEmail } → one single-use link per address (optionally emailed)
 *   { open: true, maxUses } → one shareable link with a use limit
 * Shared: kind (artist|label), expiresInDays, note. Every invited account starts on the Free plan.
 */
export async function POST(req: NextRequest) {
  const admin = await platformAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const common = {
    kind: typeof b.kind === "string" ? b.kind : null,
    expiresInDays: typeof b.expiresInDays === "number" ? b.expiresInDays : Number(b.expiresInDays) || 14,
    note: typeof b.note === "string" ? b.note : null,
  };

  if (b.open === true) {
    const r = await createInvite({ ...common, maxUses: Number(b.maxUses) || 10 }, admin.email);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    console.info("[platform] open invite", { id: r.invite.id, maxUses: r.invite.maxUses, by: admin.email });
    return NextResponse.json({ ok: true, created: [{ id: r.invite.id, email: null, url: r.url, emailed: false }] });
  }

  const emails = [...new Set((typeof b.emails === "string" ? b.emails : "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) return NextResponse.json({ error: "Add at least one email, or make an open link" }, { status: 400 });
  if (emails.length > 50) return NextResponse.json({ error: "50 emails at a time" }, { status: 400 });
  const existing = new Set((await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } })).map((u) => u.email));
  const pending = await prisma.signupInvite.findMany({ where: { email: { in: emails }, revokedAt: null, expiresAt: { gt: new Date() } }, select: { email: true, uses: true, maxUses: true } });
  const invited = new Set(pending.filter((i) => i.uses < i.maxUses).map((i) => i.email));
  const created: { id: string; email: string; url: string; emailed: boolean }[] = [];
  const skipped: { email: string; reason: string }[] = [];
  for (const email of emails) {
    if (existing.has(email)) { skipped.push({ email, reason: "already has an account" }); continue; }
    if (invited.has(email)) { skipped.push({ email, reason: "already has an active invite (copy or resend it in the list)" }); continue; }
    const r = await createInvite({ ...common, email }, admin.email);
    if (!r.ok) { skipped.push({ email, reason: r.error }); continue; }
    let emailed = false;
    if (b.sendEmail === true) emailed = await sendInviteEmail(r.invite, r.url).catch((e) => { console.error("[invite email]", e); return false; });
    created.push({ id: r.invite.id, email, url: r.url, emailed });
  }
  console.info("[platform] email invites", { created: created.length, skipped: skipped.length, by: admin.email });
  return NextResponse.json({ ok: true, created, skipped });
}
