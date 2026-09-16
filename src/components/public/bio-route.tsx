import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { isBot } from "@/lib/tracking";
import { labelDuplicateLinks } from "@/lib/link-labels";
import { publicTheme } from "./artwork-shell";
import { BioView } from "./bio-view";

export async function loadBio(slug: string, host?: string) {
  const page = await prisma.bioPage.findUnique({
    where: { slug: decodeURIComponent(slug).toLowerCase() },
    include: { organization: true, links: { where: { isActive: true }, orderBy: { order: "asc" } } },
  });
  if (!page || !page.isPublic) return null;
  if (host) {
    const h = host.toLowerCase().split(":")[0];
    const sub = h.match(/^([a-z0-9-]+)\.droplr\.fm$/)?.[1];
    const ok = sub ? page.organization.slug === sub : page.organization.customDomain === h;
    if (!ok) return null;
  }
  return page;
}

export function bioMetadata(page: Awaited<ReturnType<typeof loadBio>>): Metadata {
  if (!page) return {};
  const description = page.bio ?? `Links from ${page.title}`;
  return {
    title: { absolute: page.title },
    description,
    openGraph: { title: page.title, description, images: [{ url: page.imageUrl }] },
    twitter: { card: "summary", title: page.title, description, images: [page.imageUrl] },
  };
}

export async function BioRoute({ page }: { page: Awaited<ReturnType<typeof loadBio>> }) {
  if (!page) notFound();
  const h = headers();
  if (!isBot(h.get("user-agent")) && h.get("purpose") !== "prefetch") {
    await prisma.bioPage.update({ where: { id: page.id }, data: { views: { increment: 1 } } }).catch(() => {});
  }
  const plan = planOf(page.organization.plan);
  return (
    <BioView
      page={{ title: page.title, bio: page.bio, imageUrl: page.imageUrl, accentColor: page.accentColor ?? page.organization.accentColor, links: labelDuplicateLinks(page.links.map((l) => ({ ...l, title: l.label }))).map((l) => ({ id: l.id, platform: l.platform, label: l.label, buttonText: l.buttonText, icon: l.icon })) }}
      orgName={page.organization.name}
      showBranding={!plan.removeBranding}
      theme={publicTheme(page.organization)}
      pixels={plan.pixels ? { meta: page.organization.metaPixelId, tiktok: page.organization.tiktokPixelId, ga4: page.organization.ga4Id, contentName: `Bio - ${page.title}` } : null}
    />
  );
}
