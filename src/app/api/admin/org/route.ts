import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DOMAIN_REDIRECT_DAYS, domainProblem, newDomainToken, nextPreviousDomains, queueDetach } from "@/lib/domains";
import { UNVERIFIED_ERROR } from "@/lib/email-verification";
import { planOf } from "@/lib/plans";
import { isValidTimeZone } from "@/lib/time";
import { RESERVED_SLUGS, slugify } from "@/lib/utils";

const id = z.string().max(40).regex(/^[A-Za-z0-9_-]*$/, "Letters, numbers, - and _ only");
const schema = z.object({
  name: z.string().min(2).max(100).optional(),
  metaPixelId: id.optional(),
  tiktokPixelId: id.optional(),
  ga4Id: id.optional(),
  customDomain: z.string().max(253).regex(/^$|^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i, "Enter a hostname like listen.yourlabel.com").optional(),
  emailFromName: z.string().max(80).optional(),
  emailReplyTo: z.string().email().or(z.literal("")).optional(),
  slug: z.string().max(60).optional(),
  timezone: z.string().max(64).refine(isValidTimeZone, "Unknown timezone").optional(),
  locationLabel: z.string().trim().min(1).max(40).optional(),
  themePreference: z.enum(["dark", "light", "system"]).optional(),
  themePublic: z.boolean().optional(),
  dashboardGlow: z.boolean().optional(),
  accentColor: z.string().regex(/^$|^#[0-9a-fA-F]{6}$/, "Accent colour must be a hex like #8B5CF6").optional(),
  logoUrl: z.string().url().or(z.literal("")).optional(),
  releaseEmailHour: z.number().int().min(0).max(23).nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const d = parsed.data;
  const plan = planOf(user.organization.plan);
  if ((d.metaPixelId || d.tiktokPixelId || d.ga4Id) && !plan.pixels) return NextResponse.json({ error: "Pixels are on paid plans" }, { status: 402 });
  if (d.customDomain && !plan.customDomain) return NextResponse.json({ error: "Custom domains are on Artist Pro and the label plans" }, { status: 402 });
  const domain = d.customDomain?.toLowerCase().trim();
  if (domain) {
    if (!user.emailVerifiedAt && domain !== user.organization.customDomain) return NextResponse.json({ error: UNVERIFIED_ERROR }, { status: 403 });
    const problem = domainProblem(domain);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const clash = await prisma.organization.findUnique({ where: { customDomain: domain } });
    if (clash && clash.id !== user.organizationId) return NextResponse.json({ error: "Domain already connected to another label" }, { status: 409 });
    // Held for another account's old links. They get it once they prove they own it (the TXT check at attach clears the claim).
    const heldBy = await prisma.organization.findFirst({ where: { previousDomains: { has: domain }, id: { not: user.organizationId } }, select: { id: true } });
    if (heldBy) return NextResponse.json({ error: "Another label is still redirecting from that domain. Add the TXT record to prove it's yours and it'll switch over." }, { status: 409 });
  }
  // Slug rename: keep the old one in previousSlugs so every link already shared keeps redirecting.
  let slugData: { slug: string; previousSlugs: string[] } | undefined;
  if (d.slug !== undefined) {
    const slug = slugify(d.slug);
    const org = user.organization;
    if (!slug || slug.length < 2 || RESERVED_SLUGS.has(slug)) return NextResponse.json({ error: "That slug is reserved or too short" }, { status: 400 });
    if (slug !== org.slug) {
      const [orgClash, releaseClash, oldClash] = await Promise.all([
        prisma.organization.findUnique({ where: { slug } }),
        prisma.release.findUnique({ where: { slug } }),
        prisma.organization.findFirst({ where: { previousSlugs: { has: slug }, id: { not: org.id } } }),
      ]);
      if (orgClash || oldClash) return NextResponse.json({ error: "That slug is taken by another label" }, { status: 409 });
      if (releaseClash) return NextResponse.json({ error: "That slug is already a release URL" }, { status: 409 });
      slugData = { slug, previousSlugs: [...new Set([...org.previousSlugs.filter((s) => s !== slug), org.slug])] };
    }
  }

  // A new (or cleared) domain starts setup from scratch with a fresh TXT token; re-saving the same domain changes nothing.
  const previousDomain = user.organization.customDomain;
  const domainChanged = d.customDomain !== undefined && (domain || null) !== previousDomain;
  // An old domain that was actually attached keeps its alias, and its links keep redirecting here (see lib/releases).
  // One that never got as far as Netlify has nothing to redirect, so it's just dropped.
  const keepsRedirecting = domainChanged && !!previousDomain && !!user.organization.customDomainAttachedAt;
  const nextPrevious = nextPreviousDomains(user.organization.previousDomains, previousDomain, domain || null, keepsRedirecting);
  const domainData = domainChanged
    ? {
        customDomain: domain || null,
        customDomainToken: domain ? newDomainToken() : null,
        customDomainVerifiedAt: null, customDomainAttachedAt: null, customDomainLiveAt: null,
        customDomainCheckedAt: null, customDomainError: null, customDomainFailures: 0,
        previousDomains: nextPrevious,
      }
    : {};

  await prisma.organization.update({
    where: { id: user.organizationId },
    data: {
      ...slugData,
      ...(d.timezone !== undefined && { timezone: d.timezone }),
      ...(d.locationLabel !== undefined && { locationLabel: d.locationLabel }),
      ...(d.themePreference !== undefined && { themePreference: d.themePreference }),
      ...(d.themePublic !== undefined && { themePublic: d.themePublic }),
      ...(d.dashboardGlow !== undefined && { dashboardGlow: d.dashboardGlow }),
      ...(d.accentColor !== undefined && { accentColor: d.accentColor || null }),
      ...(d.logoUrl !== undefined && { logoUrl: d.logoUrl || null }),
      ...(d.name !== undefined && { name: d.name }),
      ...(d.metaPixelId !== undefined && { metaPixelId: d.metaPixelId || null }),
      ...(d.tiktokPixelId !== undefined && { tiktokPixelId: d.tiktokPixelId || null }),
      ...(d.ga4Id !== undefined && { ga4Id: d.ga4Id || null }),
      ...domainData,
      ...(d.emailFromName !== undefined && { emailFromName: d.emailFromName || null }),
      ...(d.emailReplyTo !== undefined && { emailReplyTo: d.emailReplyTo || null }),
      ...(d.releaseEmailHour !== undefined && { releaseEmailHour: d.releaseEmailHour }),
    },
  });
  // The old domain's Netlify alias is released a year from now, not today, so links already shared keep working
  // until then. Retried by the domain cron if Netlify is unavailable when the time comes.
  if (keepsRedirecting) await queueDetach(previousDomain!, new Date(Date.now() + DOMAIN_REDIRECT_DAYS * 86_400_000)).catch(() => {});
  // Pushed past the cap (or re-claimed as the current domain): those stop redirecting now.
  if (domainChanged) {
    for (const gone of user.organization.previousDomains.filter((x) => x !== domain && !nextPrevious.includes(x))) {
      await queueDetach(gone).catch(() => {});
    }
  }
  const message = domainChanged && domain
    ? keepsRedirecting
      ? `Saved. Add the DNS records below, then press Check now. Links on ${previousDomain} keep redirecting here for a year.`
      : "Saved. Add the DNS records below, then press Check now."
    : undefined;
  return NextResponse.json({ ok: true, slug: slugData?.slug, ...(message ? { message } : {}) });
}
