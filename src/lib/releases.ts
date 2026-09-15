import { prisma } from "./db";

const include = {
  organization: true,
  platformLinks: { where: { isActive: true }, orderBy: { order: "asc" as const } },
  linkVariants: { where: { isActive: true } },
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
  | null;

/** droplr.fm paths: /slug, /slug/variant, /org/slug, /org/slug/variant */
export async function resolvePlatformPath(parts: string[], variantQuery?: string | null): Promise<Resolution> {
  const [a, b, c] = parts.map((p) => decodeURIComponent(p).toLowerCase());
  if (parts.length === 1) {
    const r = await loadBySlug(a);
    if (r) return { kind: "release", release: r, variant: pickVariant(r, variantQuery) };
    const org = await prisma.organization.findUnique({ where: { slug: a } });
    return org ? { kind: "org", org } : null;
  }
  if (parts.length === 2) {
    const org = await prisma.organization.findUnique({ where: { slug: a } });
    if (org) {
      const r = await loadBySlug(b, org.id);
      if (r) return { kind: "release", release: r, variant: pickVariant(r, variantQuery) };
    }
    const r = await loadBySlug(a);
    if (r) {
      const v = pickVariant(r, b);
      if (v) return { kind: "release", release: r, variant: v };
    }
    return null;
  }
  if (parts.length === 3) {
    const org = await prisma.organization.findUnique({ where: { slug: a } });
    if (!org) return null;
    const r = await loadBySlug(b, org.id);
    if (!r) return null;
    const v = pickVariant(r, c);
    return v ? { kind: "release", release: r, variant: v } : null;
  }
  return null;
}

/** Custom domain (presave.label.com) or subdomain (label.droplr.fm): /, /slug, /slug/variant */
export async function resolveTenantPath(host: string, parts: string[], variantQuery?: string | null): Promise<Resolution> {
  const h = host.toLowerCase().split(":")[0];
  const sub = h.match(/^([a-z0-9-]+)\.droplr\.fm$/)?.[1];
  const org = sub
    ? await prisma.organization.findUnique({ where: { slug: sub } })
    : await prisma.organization.findUnique({ where: { customDomain: h } });
  if (!org) return null;
  if (parts.length === 0) return { kind: "org", org };
  const r = await loadBySlug(decodeURIComponent(parts[0]).toLowerCase(), org.id);
  if (!r) return null;
  const variantSlug = parts[1] ?? variantQuery;
  const v = pickVariant(r, variantSlug);
  if (parts[1] && !v) return null;
  return { kind: "release", release: r, variant: v };
}

export function publicReleaseUrl(org: { slug: string; customDomain: string | null }, slug: string, siteUrl: string, variant?: string) {
  const base = org.customDomain ? `https://${org.customDomain}/${slug}` : `${siteUrl}/${org.slug}/${slug}`;
  return variant ? `${base}/${variant}` : base;
}
