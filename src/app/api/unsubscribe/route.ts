import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { signToken, verifyLegacyToken, verifyToken } from "@/lib/crypto";
import { prefsPage } from "@/lib/email-prefs";

export const dynamic = "force-dynamic";

async function unsubscribe(t: string | null) {
  // Legacy: unsubscribe links emailed before tokens carried an audience must keep working.
  const tok = (await verifyToken<{ ps?: string; fc?: string; act: string }>(t, "unsub")) ?? (await verifyLegacyToken<{ ps?: string; fc?: string; act: string }>(t));
  if (!tok || tok.act !== "unsub") return null;

  // An imported contact: no PreSave row exists, so the opt-out lands on the contact itself.
  // Also written across any pre-save rows for that address, because the fan is telling this
  // label to stop — not telling one table to stop.
  if (typeof tok.fc === "string") {
    const c = await prisma.fanContact.findUnique({ where: { id: tok.fc }, include: { organization: true } });
    if (!c) return null;
    await prisma.fanContact.update({ where: { id: c.id }, data: { status: "unsubscribed" } });
    await prisma.preSave.updateMany({
      where: { email: c.email, release: { organizationId: c.organizationId } },
      data: { emailConsent: false, newsConsent: false },
    });
    await prisma.preSave.updateMany({
      where: { email: c.email, platform: "email", release: { organizationId: c.organizationId } },
      data: { status: "unsubscribed" },
    });
    return { org: c.organization.name, presaveId: null };
  }

  if (typeof tok.ps !== "string") return null;
  const ps = await prisma.preSave.findUnique({ where: { id: tok.ps }, include: { release: { include: { organization: true } } } });
  if (!ps?.email) return null;
  // Unsubscribe this address from every release of this label
  await prisma.preSave.updateMany({
    where: { email: ps.email, release: { organizationId: ps.release.organizationId } },
    data: { emailConsent: false, newsConsent: false },
  });
  await prisma.preSave.updateMany({
    where: { email: ps.email, platform: "email", release: { organizationId: ps.release.organizationId } },
    data: { status: "unsubscribed" },
  });
  return { org: ps.release.organization.name, presaveId: ps.id };
}

export async function GET(req: NextRequest) {
  const done = await unsubscribe(req.nextUrl.searchParams.get("t"));
  if (!done) return prefsPage(`<h1>Link expired</h1><p>This unsubscribe link is invalid or expired.</p>`, 400);
  const name = done.org.replace(/[<>&]/g, "");
  // One-tap way back for someone who didn't mean to unsubscribe. Only the fan can use it: the label can't
  // re-subscribe anyone, and the link is tied to this address for 30 days.
  // No resubscribe link for an imported contact: there is no pre-save to turn back on, and
  // re-adding them to a list they just left is exactly the behaviour that earns spam reports.
  const back = done.presaveId ? await signToken({ ps: done.presaveId, act: "resub" }, "30d", "unsub") : null;
  return prefsPage(
    `<h1>You're unsubscribed</h1><p>You won't get release emails or news from ${name} anymore.</p>
     ${back ? `<p style="color:#a1a1aa;font-size:14px;margin-top:28px">Didn't mean to? <a href="/api/unsubscribe/undo?t=${back}" style="color:#fafafa">Turn release emails back on</a>. This link works for 30 days.</p>` : ""}
     <p style="color:#71717a;font-size:13px;margin-top:12px">You can get back to this page any time from the unsubscribe link in an earlier email. We won't email you to confirm this.</p>`,
  );
}

// RFC 8058 one-click unsubscribe
export async function POST(req: NextRequest) {
  const done = await unsubscribe(req.nextUrl.searchParams.get("t"));
  return NextResponse.json({ ok: !!done }, { status: done ? 200 : 400 });
}
