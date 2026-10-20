import { headers } from "next/headers";
import { after } from "next/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cache } from "react";
import { bioLabelBadges } from "@/lib/bio-label-server";
import { bioReleaseFor } from "@/lib/bio-release-server";
import { prisma } from "@/lib/db";
import { bioPublicUrl } from "@/lib/bio";
import { NOT_FOUND_TITLE } from "@/lib/seo";
import { planOf } from "@/lib/plans";
import { isBot } from "@/lib/tracking";
import { labelDuplicateLinks } from "@/lib/link-labels";
import { publicTheme } from "./artwork-shell";
import { BioView } from "./bio-view";

/** Cached per request: generateMetadata and the page both call it. */
export const loadBio = cache(async function loadBio(slug: string, host?: string) {
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
});

export function bioMetadata(page: Awaited<ReturnType<typeof loadBio>>): Metadata {
  // A missing page used to carry no metadata at all, so it inherited the site's default title —
  // a dead link on a label's own domain showed a browser tab reading "droplr.fm — Launch every
  // release like a label would". Absolute, because the "· droplr.fm" template is droplr's
  // branding and this page may be answering on someone else's address.
  if (!page) return { title: { absolute: NOT_FOUND_TITLE }, robots: { index: false, follow: false } };
  const description = page.bio ?? `Links from ${page.title}`;
  return {
    title: { absolute: page.title },
    description,
    /**
     * One page, one address. The same bio page answers on droplr.fm/b/slug and on the label's
     * custom domain, and letting both into the index makes a page compete with itself for its
     * own name. bioPublicUrl already decides which one is the real one.
     */
    alternates: { canonical: bioPublicUrl(page.organization, page.slug) },
    openGraph: { title: page.title, description, images: [{ url: page.imageUrl }] },
    twitter: { card: "summary", title: page.title, description, images: [page.imageUrl] },
  };
}

export async function BioRoute({ page }: { page: Awaited<ReturnType<typeof loadBio>> }) {
  if (!page) notFound();
  const h = await headers();
  if (!isBot(h.get("user-agent")) && h.get("purpose") !== "prefetch") {
    // Counted after the response so it doesn't hold up the page.
    after(() => prisma.bioPage.update({ where: { id: page.id }, data: { views: { increment: 1 } } }).catch(() => {}));
  }
  const plan = planOf(page.organization.plan);

  const [releases, labels] = await Promise.all([
    bioReleaseFor(page, page.organization),
    bioLabelBadges(page, page.organization),
  ]);

  return (
    <BioView
      page={{ title: page.title, bio: page.bio, imageUrl: page.imageUrl, accentColor: page.accentColor ?? page.organization.accentColor, theme: page.theme, font: page.font, releases, background: { url: page.backgroundUrl, color: page.backgroundColor }, buttonColor: page.buttonColor, links: labelDuplicateLinks(page.links.map((l) => ({ ...l, title: l.label }))).map((l) => ({ id: l.id, platform: l.platform, url: l.url, label: l.label, buttonText: l.buttonText, icon: l.icon, iconUrl: l.iconUrl })) }}
      orgName={page.organization.name}
      timezone={page.organization.timezone}
      labels={labels}
      glow={{ on: page.organization.publicGlow, color: page.organization.glowColor }}
      showBranding={!plan.removeBranding}
      theme={publicTheme(page.organization)}
      pixels={plan.pixels ? { meta: page.organization.metaPixelId, tiktok: page.organization.tiktokPixelId, ga4: page.organization.ga4Id, contentName: `Bio - ${page.title}` } : null}
    />
  );
}
