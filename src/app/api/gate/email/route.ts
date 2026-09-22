import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { DOWNLOAD_CONSENT_VERSION } from "@/lib/legal";
import { completeStep } from "@/lib/downloads";
import { releasePageUrl, requestOrigin, safeReturnUrl, withParam } from "@/lib/oauth";
import { allow, emailKey, ipKey } from "@/lib/throttle";
import { ANON_COOKIE, clientIp, fanTimezone, requestMeta, resolveSource } from "@/lib/tracking";

export const dynamic = "force-dynamic";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * The email step of a download gate. Plain HTML form POST like every other fan-facing form here,
 * so it works with JavaScript off.
 *
 * The address is written as a PreSave row with platform "download". That isn't a fudge: the fan
 * list, the insights aggregation and the unsubscribe flow are all built on PreSave joined to
 * Release, so a separate table would silently leave gate emails out of all three.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const releaseId = String(form.get("releaseId") ?? "");
  const release = await prisma.release.findUnique({ where: { id: releaseId }, include: { organization: true } });
  if (!release || release.kind !== "download") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pageUrl = await safeReturnUrl(
    releasePageUrl(req, release.organization, release.slug),
    `${SITE_URL}/${release.organization.slug}/${release.slug}`,
  );
  const fail = () => NextResponse.redirect(withParam(pageUrl, "notice", "error"), 303);

  if (form.get("website")) return NextResponse.redirect(pageUrl, 303); // honeypot
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const consent = form.get("consent") === "yes";
  const news = form.get("news") === "yes";
  if (email.length > 254 || !EMAIL_RE.test(email) || !consent) return fail();
  if (!release.isPublic) return fail();

  // Same limits and the same generic error as a pre-save: never reveal the cap.
  const okIp = await allow(ipKey("gate-email", clientIp(req.headers)), 10, 60 * 60 * 1000);
  if (!okIp || !(await allow(emailKey("gate-email", email), 5, 24 * 60 * 60 * 1000))) return fail();

  // Someone who unsubscribed from this org never gets silently re-added by a gate.
  const gone = await prisma.preSave.findFirst({
    where: { email, status: "unsubscribed", release: { organizationId: release.organizationId } },
    select: { id: true },
  });

  const anonId = req.cookies.get(ANON_COOKIE)?.value;
  if (!anonId) return fail();
  const meta = requestMeta(req.headers);
  const { host } = requestOrigin(req);
  const timezone = fanTimezone(form.get("tz"), req.headers);

  // There's no unique key across (releaseId, email, platform), so match the pre-save route's
  // find-then-write rather than inventing one.
  if (!gone) {
    const existing = await prisma.preSave.findFirst({ where: { releaseId, email, platform: "download" } });
    if (existing) {
      await prisma.preSave.update({
        where: { id: existing.id },
        data: {
          emailConsent: true, consentAt: new Date(), consentVersion: DOWNLOAD_CONSENT_VERSION,
          ...(timezone && { timezone }),
          ...(news && { newsConsent: true, newsConsentAt: new Date() }),
        },
      });
    } else {
      await prisma.preSave.create({
        data: {
          releaseId, email, platform: "download",
          // A download has no release day to email about, so the row is done the moment it exists.
          status: "completed",
          emailConsent: true, consentAt: new Date(), consentVersion: DOWNLOAD_CONSENT_VERSION,
          newsConsent: news, newsConsentAt: news ? new Date() : null,
          anonId, country: meta.country, timezone,
          source: resolveSource({ referrer: meta.referrer, selfHosts: [host] }),
        },
      });
    }
  }

  await completeStep({ releaseId, anonId, platform: "email", email, country: meta.country, timezone });
  return NextResponse.redirect(withParam(pageUrl, "done", "email"), 303);
}
