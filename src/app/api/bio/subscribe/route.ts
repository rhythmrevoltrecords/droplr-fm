import { after, NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { bioPublicUrl } from "@/lib/bio";
import {
  BIO_CONSENT_SOURCE,
  emailAcceptable,
  normaliseEmail,
  showSubscribe,
  subscribeConsentNote,
} from "@/lib/bio-subscribe";
import { isOptedOut } from "@/lib/fan-consent";
import { newsConfirmed, requestNewsConfirmation } from "@/lib/news-confirm";
import { BIO_SUBSCRIBE_CONSENT_VERSION } from "@/lib/legal";
import { requestOrigin, safeReturnUrl, withParam } from "@/lib/oauth";
import { allow, emailKey, ipKey } from "@/lib/throttle";
import { clientIp, fanTimezone, requestMeta } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * The subscribe button on a bio page. Plain HTML form POST, no JavaScript needed — these pages
 * are opened from inside Instagram and TikTok's in-app browsers more than anywhere else, and the
 * pre-save form already took this approach for the same reason.
 *
 * Shape copied deliberately from /api/presave/email: honeypot, then validate, then the page's own
 * switch, then rate limits, then the opt-out check, and only then a write. Every rejection returns
 * the SAME redirect a success does wherever telling them apart would reveal something about
 * another person — see the comments at each one.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const pageId = String(form?.get("bioPageId") ?? "");
  const page = await prisma.bioPage.findUnique({ where: { id: pageId }, include: { organization: true } });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { origin } = requestOrigin(req);
  const pageUrl = await safeReturnUrl(`${origin}/b/${page.slug}`, bioPublicUrl(page.organization, page.slug));
  const ok = () => NextResponse.redirect(withParam(pageUrl, "done", "subscribed"), 303);
  const bad = () => NextResponse.redirect(withParam(pageUrl, "notice", "error"), 303);

  // Honeypot. A bot that fills every field gets the success page: telling it the field exists is
  // how it learns to leave that one alone next time.
  if (form?.get("website")) return ok();

  const email = normaliseEmail(form?.get("email"));
  if (!emailAcceptable(email) || form?.get("consent") !== "yes") return bad();

  // The page's own switch, checked server-side. A client component's props are public, so the
  // form's presence in the HTML proves nothing about whether this page collects addresses.
  // An unpublished page collects nothing either: it is not a page anyone was meant to reach.
  if (!page.isPublic || !showSubscribe(page)) return bad();

  // 10 per IP per hour, 5 per address per day — the pre-save form's limits. Same generic error as
  // bad input, so neither a person nor a bot learns where the limit is.
  const okIp = await allow(ipKey("bio-subscribe", clientIp(req.headers)), 10, 60 * 60 * 1000);
  if (!okIp || !(await allow(emailKey("bio-subscribe", email), 5, 24 * 60 * 60 * 1000))) return bad();

  // Someone who told this account to stop is not re-subscribed by a form post, because anyone can
  // type anyone's address. The normal success page is shown so this never reveals who unsubscribed.
  if (await isOptedOut(email, page.organizationId)) return ok();

  const meta = requestMeta(req.headers);
  const timezone = fanTimezone(form?.get("tz"), req.headers);
  const now = new Date();
  // Mailable only once the fan has confirmed by email, or already had for this account. A row the
  // account could already mail is never moved down by someone typing its address in.
  const existing = await prisma.fanContact.findUnique({ where: { organizationId_email: { organizationId: page.organizationId, email } }, select: { status: true } });
  const confirmed = existing?.status === "mailable" || (await newsConfirmed(page.organizationId, email));
  const consent = {
    consentSource: BIO_CONSENT_SOURCE,
    consentKind: "marketing",
    consentAt: now,
    consentVersion: BIO_SUBSCRIBE_CONSENT_VERSION,
    consentNote: subscribeConsentNote(page.organization.name),
    status: confirmed ? "mailable" : "pending",
    bioPageId: page.id,
  };

  /**
   * Upsert, not create. The unique key is (organizationId, email), and three things land here:
   *
   *  - a new address: created `pending`, and an email asks the fan to confirm. It becomes mailable
   *    when they press the button (lib/news-confirm), or at once if this address already confirmed
   *    news for this account.
   *  - the same fan again: consentAt and consentVersion move forward. Harmless and more accurate
   *    than keeping the first one.
   *  - an address the account previously IMPORTED and never confirmed (`pending`, and so
   *    unreachable). It becomes a page capture, still pending, and the fan is asked to confirm.
   *    This used to make it mailable on the spot, which let a stranger who typed someone's address
   *    put them on a list. The confirmation email closes that: only the owner of the inbox can
   *    press the button. Unsubscribed never comes back here at all (isOptedOut above).
   *
   * importId is cleared on that third case. Leaving it set would keep the row inside every count
   * and screen labelled "imported", which would then be describing something that is no longer true.
   */
  await prisma.fanContact.upsert({
    where: { organizationId_email: { organizationId: page.organizationId, email } },
    create: {
      organizationId: page.organizationId,
      email,
      country: meta.country,
      timezone,
      importId: null,
      ...consent,
    },
    update: {
      ...consent,
      importId: null,
      ...(meta.country && { country: meta.country }),
      ...(timezone && { timezone }),
    },
  });

  if (!confirmed) after(() => requestNewsConfirmation(page.organization, email).then(() => {}).catch((e) => console.error("[news-confirm]", e)));
  return ok();
}
