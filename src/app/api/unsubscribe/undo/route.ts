import { type NextRequest } from "next/server";
import { verifyToken } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { prefsPage } from "@/lib/email-prefs";
import { FAN_EMAIL_CONSENT_VERSION } from "@/lib/legal";

export const dynamic = "force-dynamic";

/**
 * "I didn't mean to unsubscribe": only reachable from the link on the unsubscribe confirmation page,
 * so the fan is the one acting — a label can never re-subscribe someone. Restores release-day emails for
 * that address and label, and records fresh consent. The optional news opt-in stays off: they tick that themselves.
 */
const expired = () => prefsPage(`<h1>Link expired</h1><p>This link is invalid or has expired. Pre-save the next release to hear about it.</p>`, 400);

async function load(t: string | null) {
  const tok = await verifyToken<{ ps: string; act: string }>(t, "unsub");
  if (!tok || tok.act !== "resub" || typeof tok.ps !== "string") return null;
  return prisma.preSave.findUnique({ where: { id: tok.ps }, include: { release: { include: { organization: true } } } });
}

/** GET only asks, POST acts — the same reason as the unsubscribe route: link scanners follow GETs. */
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t");
  const ps = await load(t);
  if (!ps?.email || !t) return expired();
  const name = ps.release.organization.name.replace(/[<>&"]/g, "");
  return prefsPage(
    `<h1>Turn release emails from ${name} back on?</h1>
     <form method="post" action="/api/unsubscribe/undo?t=${encodeURIComponent(t)}" style="margin-top:28px">
       <button style="background:#fafafa;color:#09090b;border:0;border-radius:10px;padding:12px 20px;font:600 15px system-ui;cursor:pointer">Yes, turn them back on</button>
     </form>
     <p style="color:#71717a;font-size:13px;margin-top:16px">Nothing happens unless you press that.</p>`,
  );
}

export async function POST(req: NextRequest) {
  const ps = await load(req.nextUrl.searchParams.get("t"));
  if (!ps?.email) return expired();

  const where = { email: ps.email, release: { organizationId: ps.release.organizationId } };
  await prisma.preSave.updateMany({ where, data: { emailConsent: true, consentAt: new Date(), consentVersion: FAN_EMAIL_CONSENT_VERSION } });
  await prisma.preSave.updateMany({
    // Releases already emailed stay "emailed"; the rest go back in the queue.
    where: { ...where, platform: "email", status: "unsubscribed" },
    data: { status: "pending" },
  });
  await prisma.preSave.updateMany({ where: { ...where, platform: "email", status: "pending", emailSentAt: { not: null } }, data: { status: "emailed" } });
  const name = ps.release.organization.name.replace(/[<>&]/g, "");
  console.info("[unsubscribe] undone", { org: ps.release.organizationId });
  return prefsPage(
    `<h1>You're back on the list</h1><p>You'll get release-day emails from ${name} again. Every email still has an unsubscribe link.</p>
     <p style="color:#a1a1aa;font-size:14px;margin-top:28px">News and new music are separate: tick that box on a pre-save page if you want those too.</p>`,
  );
}
