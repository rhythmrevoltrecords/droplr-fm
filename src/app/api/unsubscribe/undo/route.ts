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
export async function GET(req: NextRequest) {
  const tok = await verifyToken<{ ps: string; act: string }>(req.nextUrl.searchParams.get("t"), "unsub");
  if (!tok || tok.act !== "resub" || typeof tok.ps !== "string") {
    return prefsPage(`<h1>Link expired</h1><p>This link is invalid or has expired. Pre-save the next release to hear about it.</p>`, 400);
  }
  const ps = await prisma.preSave.findUnique({ where: { id: tok.ps }, include: { release: { include: { organization: true } } } });
  if (!ps?.email) return prefsPage(`<h1>Link expired</h1><p>This link is invalid or has expired.</p>`, 400);

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
