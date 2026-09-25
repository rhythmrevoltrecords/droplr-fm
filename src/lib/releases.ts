import { cache } from "react";
import { prisma } from "./db";
import { SITE_URL } from "./env";
import { activeCustomDomain, linkCustomDomain } from "./plans";

const include = {
  organization: true,
  links: { where: { visible: true }, orderBy: { position: "asc" as const } },
  linkVariants: { where: { isActive: true } },
  // Gate steps on every public load. Cheap (a handful of rows, indexed by releaseId) and it
  // means a download page never needs a second round trip before it can render.
  // downloadUrl is deliberately NOT selected anywhere a page can reach: only the unlock route
  // touches it, which is what stops the destination leaking into the gate page's HTML.
  gateSteps: { orderBy: { position: "asc" as const } },
};

export type PublicRelease = NonNullable<Awaited<ReturnType<typeof loadBySlug>>>;

async function loadBySlug(slug: string, organizationId?: string) {
  const r = await prisma.release.findUnique({ where: { slug }, include });
  if (!r || !r.isPublic) return null;
  if (organizationId && r.organizationId !== organizationId) return null;
  return r;
}

function pickVariant(r: PublicRelease, variantSlug?: string | null) {
  if (!variantSlug) return null;
  return r.linkVariants.find((v) => v.slug === variantSlug.toLowerCase()) ?? null;
}

export type Resolution =
  | { kind: "release"; release: PublicRelease; variant: ReturnType<typeof pickVariant> }
  | { kind: "org"; org: NonNullable<Awaited<ReturnType<typeof prisma.organization.findUnique>>> }
  /** temporary: 307 (e.g. custom domain paused by a downgrade, can come back); otherwise 308. */
  | { kind: "redirect"; to: string; temporary?: boolean }
  | null;

/** Org by current slug, or by a slug it used before (renamed labels keep old links alive). */
async function findOrgBySlug(slug: string) {
  const current = await prisma.organization.findUnique({ where: { slug } });
  if (current) return { org: current, renamed: false };
  const old = await prisma.organization.findFirst({ where: { previousSlugs: { has: slug } } });
  return old ? { org: old, renamed: true } : null;
}

/** Org by current custom domain, or by one it used to be on (a renamed domain keeps redirecting). */
async function findOrgByDomain(host: string) {
  const current = await prisma.organization.findUnique({ where: { customDomain: host } });
  if (current) return { org: current, moved: false };
  const old = await prisma.organization.findFirst({ where: { previousDomains: { has: host } } });
  return old ? { org: old, moved: true } : null;
}

const path = (...segs: (string | null | undefined)[]) => "/" + segs.filter(Boolean).map((x) => encodeURIComponent(x!)).join("/");

/**
 * droplr.fm paths. Canonical form is /{orgSlug}/{releaseSlug}[/{variant}].
 * Legacy /{releaseSlug}[/{variant}] and old org slugs return a redirect to the canonical URL.
 */
async function resolvePlatformPathUncached(parts: string[], variantQuery?: string | null): Promise<Resolution> {
  const [a, b, c] = parts.map((p) => decodeURIComponent(p).toLowerCase());
  if (parts.length === 1) {
    const found = await findOrgBySlug(a);
    if (found) return found.renamed ? { kind: "redirect", to: path(found.org.slug) } : { kind: "org", org: found.org };
    const r = await loadBySlug(a);
    if (r) return { kind: "redirect", to: path(r.organization.slug, r.slug, pickVariant(r, variantQuery)?.slug) };
    return null;
  }
  if (parts.length === 2) {
    const found = await findOrgBySlug(a);
    if (found) {
      const r = await loadBySlug(b, found.org.id);
      if (r) {
        if (found.renamed) return { kind: "redirect", to: path(found.org.slug, r.slug, pickVariant(r, variantQuery)?.slug) };
        const v = pickVariant(r, variantQuery);
        return v ? { kind: "redirect", to: path(found.org.slug, r.slug, v.slug) } : { kind: "release", release: r, variant: null };
      }
    }
    const r = await loadBySlug(a);
    if (r && pickVariant(r, b)) return { kind: "redirect", to: path(r.organization.slug, r.slug, b) };
    return null;
  }
  if (parts.length === 3) {
    const found = await findOrgBySlug(a);
    if (!found) return null;
    const r = await loadBySlug(b, found.org.id);
    if (!r) return null;
    const v = pickVariant(r, c);
    if (!v) return null;
    return found.renamed ? { kind: "redirect", to: path(found.org.slug, r.slug, v.slug) } : { kind: "release", release: r, variant: v };
  }
  return null;
}

/**
 * Custom domain (presave.label.com) or subdomain (label.droplr.fm): /, /slug, /slug/variant.
 * The domain already identifies the label, so the canonical form stays short.
 * /{orgSlug}/{slug}[/{variant}] on a custom domain redirects to /{slug}[/{variant}].
 */
async function resolveTenantPathUncached(host: string, parts: string[], variantQuery?: string | null): Promise<Resolution> {
  const h = host.toLowerCase().split(":")[0];
  const sub = h.match(/^([a-z0-9-]+)\.droplr\.fm$/)?.[1];
  const found = sub ? await findOrgBySlug(sub).then((f) => (f ? { org: f.org, moved: false } : null)) : await findOrgByDomain(h);
  const org = found?.org ?? null;
  if (!org) return null;
  // The label moved to another domain. Send the visitor to the same page on the current one.
  // Permanent only when there is another live domain to point at: a 308 to droplr.fm would be cached by the
  // browser and the new domain would never take over for that visitor once it finishes connecting.
  if (found?.moved) {
    const rest = parts.map((p) => decodeURIComponent(p).toLowerCase()).map(encodeURIComponent);
    const live = linkCustomDomain(org);
    return live
      ? { kind: "redirect", to: [`https://${live}`, ...rest].join("/") }
      : { kind: "redirect", to: [`${SITE_URL}/${org.slug}`, ...rest].join("/"), temporary: true };
  }
  // Custom domain no longer on the plan (after the grace period): send visitors to the same page on droplr.fm
  // instead of breaking links that were already shared. Temporary, because upgrading switches the domain back on.
  if (!sub && !activeCustomDomain(org)) {
    const rest = parts.map((p) => decodeURIComponent(p).toLowerCase());
    if (rest[0] === org.slug || org.previousSlugs.includes(rest[0])) rest.shift();
    return { kind: "redirect", to: [`${SITE_URL}/${org.slug}`, ...rest.map(encodeURIComponent)].join("/"), temporary: true };
  }
  if (parts.length === 0) return { kind: "org", org };
  const segs = parts.map((p) => decodeURIComponent(p).toLowerCase());
  if ((segs[0] === org.slug || org.previousSlugs.includes(segs[0])) && segs.length >= 2) {
    const r = await loadBySlug(segs[1], org.id);
    if (r) return { kind: "redirect", to: path(r.slug, segs[2]) };
  }
  if (segs.length > 2) return null;
  const r = await loadBySlug(segs[0], org.id);
  if (!r) return null;
  if (!segs[1] && variantQuery) {
    const v = pickVariant(r, variantQuery);
    if (v) return { kind: "redirect", to: path(r.slug, v.slug) };
  }
  const v = pickVariant(r, segs[1]);
  if (segs[1] && !v) return null;
  return { kind: "release", release: r, variant: v };
}

// generateMetadata and the page both resolve the same path in one request. React cache() dedupes per request,
// keyed by argument identity, so the path parts are joined into a string key (a fresh array would never hit).
const cachedPlatformPath = cache((key: string, variantQuery: string | null) => resolvePlatformPathUncached(JSON.parse(key) as string[], variantQuery));
const cachedTenantPath = cache((host: string, key: string, variantQuery: string | null) => resolveTenantPathUncached(host, JSON.parse(key) as string[], variantQuery));

export function resolvePlatformPath(parts: string[], variantQuery?: string | null): Promise<Resolution> {
  return cachedPlatformPath(JSON.stringify(parts), variantQuery ?? null);
}

export function resolveTenantPath(host: string, parts: string[], variantQuery?: string | null): Promise<Resolution> {
  return cachedTenantPath(host, JSON.stringify(parts), variantQuery ?? null);
}

export function publicReleaseUrl(org: { slug: string; customDomain: string | null; plan?: string | null; planUpdatedAt?: Date | null; customDomainLiveAt?: Date | null }, slug: string, siteUrl: string, variant?: string) {
  // Callers without plan info (e.g. previews) pass customDomain: null.
  const domain = org.plan === undefined ? org.customDomain : linkCustomDomain({ plan: org.plan, customDomain: org.customDomain, planUpdatedAt: org.planUpdatedAt, customDomainLiveAt: org.customDomainLiveAt ?? null });
  const base = domain ? `https://${domain}/${slug}` : `${siteUrl}/${org.slug}/${slug}`;
  return variant ? `${base}/${variant}` : base;
}
