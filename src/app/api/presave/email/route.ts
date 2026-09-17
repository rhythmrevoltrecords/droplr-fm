import { FAN_EMAIL_CONSENT_VERSION } from "@/lib/legal";
import { after, NextResponse, type NextRequest } from "next/server";
import { notifyPresaveMilestone } from "@/lib/push";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { releasePageUrl, requestOrigin, safeReturnUrl, withParam } from "@/lib/oauth";
import { allow, emailKey, ipKey } from "@/lib/throttle";
import { isListenChoice } from "@/lib/platforms";
import { isReleasedFor } from "@/lib/time";
import { clientIp, fanTimezone, requestMeta, resolveSource, SRC_COOKIE, ANON_COOKIE } from "@/lib/tracking";

export const dynamic = "force-dynamic";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Plain HTML form POST (no JS needed): email pre-save + release-day email consent. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const releaseId = String(form.get("releaseId") ?? "");
  const release = await prisma.release.findUnique({ where: { id: releaseId }, include: { organization: true } });
  if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

  const variantId = String(form.get("variantId") ?? "") || req.cookies.get(SRC_COOKIE)?.value || null;
  const variant = variantId ? await prisma.linkVariant.findFirst({ where: { id: variantId, releaseId } }) : null;
  // Built from the Host header: fall back to the platform URL if that isn't one of our hosts.
  const pageUrl = await safeReturnUrl(releasePageUrl(req, release.organization, release.slug, variant?.slug), `${SITE_URL}/${release.organization.slug}/${release.slug}${variant?.slug ? `/${variant.slug}` : ""}`);

  if (form.get("website")) return NextResponse.redirect(withParam(pageUrl, "done", "email"), 303); // honeypot
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const consent = form.get("consent") === "yes";
  const news = form.get("news") === "yes";
  if (!EMAIL_RE.test(email) || email.length > 254 || !consent) return NextResponse.redirect(withParam(pageUrl, "notice", "error"), 303);
  const timezone = fanTimezone(form.get("tz"), req.headers);
  const listenOnRaw = form.get("listenOn");
  const listenOn = isListenChoice(listenOnRaw) ? listenOnRaw : null;
  // Hidden or already-out releases don't take pre-saves (stops this being an open mailing-list signup).
  // "Out" is per fan: someone in Los Angeles can still pre-save after it's out in Brisbane.
  if (!release.isPublic || isReleasedFor(release, release.organization.timezone, timezone)) return NextResponse.redirect(withParam(pageUrl, "notice", "error"), 303);
  // 10 per IP per hour, 5 per address per day. Same generic error as bad input: don't reveal the limit.
  const okIp = await allow(ipKey("presave-email", clientIp(req.headers)), 10, 60 * 60 * 1000);
  if (!okIp || !(await allow(emailKey("presave-email", email), 5, 24 * 60 * 60 * 1000))) return NextResponse.redirect(withParam(pageUrl, "notice", "error"), 303);

  const meta = requestMeta(req.headers);
  const { host } = requestOrigin(req);
  const source = resolveSource({ variantSource: variant?.source, utmSource: String(form.get("utm_source") ?? "") || null, referrer: meta.referrer, selfHosts: [host] });

  // Someone who unsubscribed from this label can't be re-subscribed by a form post (anyone can type their
  // address). Silently show the normal success page so this doesn't reveal who unsubscribed.
  const unsubscribed = await prisma.preSave.findFirst({ where: { email, status: "unsubscribed", release: { organizationId: release.organizationId } }, select: { id: true } });
  if (unsubscribed) return NextResponse.redirect(withParam(pageUrl, "done", "email"), 303);

  const existing = await prisma.preSave.findFirst({ where: { releaseId, email, platform: "email" } });
  if (existing) {
    await prisma.preSave.update({ where: { id: existing.id }, data: { emailConsent: true, consentAt: new Date(), consentVersion: FAN_EMAIL_CONSENT_VERSION, ...(timezone && { timezone }), ...(listenOn && { listenOn }), ...(news && { newsConsent: true, newsConsentAt: new Date() }) } });
  } else {
    await prisma.preSave.create({
      data: {
        releaseId,
        platform: "email",
        email,
        emailConsent: true,
        consentAt: new Date(),
        consentVersion: FAN_EMAIL_CONSENT_VERSION,
        status: "pending",
        sourceVariantId: variant?.id,
        source,
        anonId: req.cookies.get(ANON_COOKIE)?.value ?? null,
        country: meta.country,
        timezone,
        listenOn,
        newsConsent: news,
        newsConsentAt: news ? new Date() : null,
      },
    });
    after(() => notifyPresaveMilestone(releaseId).catch((e) => console.error("[push milestone]", e)));
  }
  return NextResponse.redirect(withParam(pageUrl, "done", "email"), 303);
}
