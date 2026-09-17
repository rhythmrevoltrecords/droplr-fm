import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { platformAdmin } from "@/lib/platform";
import { inviteCodeOf, inviteState, inviteUrl, sendInviteEmail } from "@/lib/signup-invites";

export const dynamic = "force-dynamic";

/** POST { action: "revoke" | "resend" } — platform owner switches a link off, or emails it again. */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const admin = await platformAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const invite = await prisma.signupInvite.findUnique({ where: { id } });
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { action?: unknown };
  if (b.action === "revoke") {
    await prisma.signupInvite.update({ where: { id }, data: { revokedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "resend") {
    if (!invite.email) return NextResponse.json({ error: "Open links aren't tied to an email" }, { status: 400 });
    if (inviteState(invite) !== "active") return NextResponse.json({ error: "This invite isn't active any more. Make a new one." }, { status: 400 });
    const code = inviteCodeOf(invite);
    if (!code) return NextResponse.json({ error: "Couldn't read this link (encryption key changed). Make a new one." }, { status: 500 });
    const sent = await sendInviteEmail(invite, inviteUrl(code)).catch(() => false);
    return sent ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Email isn't set up, or sending failed" }, { status: 502 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
