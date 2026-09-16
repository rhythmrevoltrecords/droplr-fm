import { FAN_EMAIL_CONSENT_VERSION } from "@/lib/legal";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { releasePageUrl, requestOrigin, withParam } from "@/lib/oauth";
import { requestMeta, resolveSource, SRC_COOKIE, ANON_COOKIE } from "@/lib/tracking";

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
  const pageUrl = releasePageUrl(req, release.organization, release.slug, variant?.slug);

  if (form.get("website")) return NextResponse.redirect(withParam(pageUrl, "done", "email"), 303); // honeypot
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const consent = form.get("consent") === "yes";
  if (!EMAIL_RE.test(email) || email.length > 254 || !consent) return NextResponse.redirect(withParam(pageUrl, "notice", "error"), 303);

  const meta = requestMeta(req.headers);
  const { host } = requestOrigin(req);
  const source = resolveSource({ variantSource: variant?.source, utmSource: String(form.get("utm_source") ?? "") || null, referrer: meta.referrer, selfHosts: [host] });

  const existing = await prisma.preSave.findFirst({ where: { releaseId, email, platform: "email" } });
  if (existing) {
    await prisma.preSave.update({ where: { id: existing.id }, data: { emailConsent: true, consentAt: new Date(), consentVersion: FAN_EMAIL_CONSENT_VERSION, status: existing.status === "unsubscribed" ? "pending" : existing.status } });
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
      },
    });
  }
  return NextResponse.redirect(withParam(pageUrl, "done", "email"), 303);
}
