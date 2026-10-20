import { NextResponse, type NextRequest } from "next/server";
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
  const consent = {
    consentSource: BIO_CONSENT_SOURCE,
    consentKind: "marketing",
    consentAt: now,
    consentVersion: BIO_SUBSCRIBE_CONSENT_VERSION,
    consentNote: subscribeConsentNote(page.organization.name),
    status: "mailable",
    bioPageId: page.id,
  };

  /**
   * Upsert, not create. The unique key is (organizationId, email), and three things land here:
   *
   *  - a new address: created mailable, because the fan did this themselves on wording droplr
   *    showed and recorded. An import starts `pending`; this is not an import.
   *  - the same fan again: consentAt and consentVersion move forward. Harmless and more accurate
   *    than keeping the first one.
   *  - an address the account previously IMPORTED and never confirmed (`pending`, and so
   *    unreachable). The fan has now asked in person, which is better evidence than the importer's
   *    attestation, so the row becomes a page capture and reachable.
   *
   *    THAT LAST ONE IS A JUDGEMENT CALL, so here is the reasoning. Anyone can type anyone's
   *    address, so in principle a stranger could move someone else's pending import to mailable.
   *    The alternative — leave a non-page row untouched — silently drops the real fan who just
   *    asked, which is the exact under-mailing this whole change exists to fix. The escalation is
   *    bounded in the only direction that matters: pending may become mailable, unsubscribed never
   *    can (isOptedOut above, which reads BOTH tables -- a second narrow check against this row
   *    was written here and removed, because a negative control could not make it fail), and
   *    every email droplr sends carries a working
   *    unsubscribe. The row also records that a page capture is what moved it, so the account
   *    holder can see it rather than wondering. The pre-save form has accepted the same exposure
   *    since launch for the same reason.
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

  return ok();
}
