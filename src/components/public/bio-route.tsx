import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cache } from "react";
import { bioLabelBadges } from "@/lib/bio-label-server";
import { bioReleaseFor } from "@/lib/bio-release-server";
import { prisma } from "@/lib/db";
import { bioPublicUrl } from "@/lib/bio";
import { showSubscribe } from "@/lib/bio-subscribe";
import { sectionOrder } from "@/lib/bio-sections";
import { merchDisplayOf, visibleItems } from "@/lib/bio-items";
import { bioSocials, showSocials, socialHref } from "@/lib/bio-socials";
import { socialSource } from "@/lib/bio-socials-server";
import { NOT_FOUND_TITLE } from "@/lib/seo";
import { planOf } from "@/lib/plans";
import { ANON_COOKIE, requestMeta, resolveSource } from "@/lib/tracking";
import { labelDuplicateLinks } from "@/lib/link-labels";
import { publicTheme } from "./artwork-shell";
import { BioView, type BioViewData } from "./bio-view";

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

export async function BioRoute({ page, done }: { page: Awaited<ReturnType<typeof loadBio>>; done?: string | null }) {
  if (!page) notFound();
  const h = await headers();
  const meta = requestMeta(h);
  if (!meta.bot && h.get("purpose") !== "prefetch") {
    const cookieStore = await cookies();
    // Captured now: the request may not outlive the response.
    const logged = {
      bioPageId: page.id,
      source: resolveSource({ referrer: meta.referrer, selfHosts: [h.get("x-forwarded-host") ?? h.get("host") ?? ""] }),
      referrer: meta.referrer?.slice(0, 500),
      country: meta.country,
      timezone: meta.timezone,
      deviceType: meta.deviceType,
      ipHash: meta.ipHash,
      anonId: cookieStore.get(ANON_COOKIE)?.value ?? null,
    };
    // Both, after the response so neither holds up the page. The integer is all-time and predates
    // this table knowing about bio pages; the row is what the last 30 days are built from.
    after(async () => {
      await prisma.$transaction([
        prisma.pageView.create({ data: logged }),
        prisma.bioPage.update({ where: { id: page.id }, data: { views: { increment: 1 } } }),
      ]).catch(() => {});
    });
  }
  const plan = planOf(page.organization.plan);

  const [releases, labels, socialLinks] = await Promise.all([
    bioReleaseFor(page, page.organization),
    bioLabelBadges(page, page.organization),
    // Only looked up when the row is on: a page that never asked for icons costs nothing extra.
    showSocials(page) ? socialSource(page, page.organization.kind) : Promise.resolve(null),
  ]);
  const socials = bioSocials(socialLinks).map((s) => ({ key: s.key, label: s.label, href: socialHref(page.id, s.key) }));

  const data: BioViewData = { title: page.title, bio: page.bio, imageUrl: page.imageUrl, accentColor: page.accentColor ?? page.organization.accentColor, theme: page.theme, font: page.font, releases, background: { url: page.backgroundUrl, color: page.backgroundColor }, buttonColor: page.buttonColor, textColor: page.textColor, glowColor: page.glowColor, iconStyle: page.iconStyle, iconColor: page.iconColor, merch: visibleItems(page.links, "merch"), merchDisplay: merchDisplayOf(page), socials, videos: visibleItems(page.links, "video"), links: labelDuplicateLinks(page.links.filter((l) => l.section === null).map((l) => ({ ...l, title: l.label }))).map((l) => ({ id: l.id, platform: l.platform, url: l.url, label: l.label, buttonText: l.buttonText, icon: l.icon, iconUrl: l.iconUrl })) };

  return (
    <BioView
      page={data}
      orgName={page.organization.name}
      timezone={page.organization.timezone}
      labels={labels}
      glow={{ on: page.organization.publicGlow, color: page.organization.glowColor }}
      subscribe={{ on: showSubscribe(page), pageId: page.id, buttonText: page.subscribeText }}
      order={sectionOrder(page.sectionOrder)}
      done={done}
      showBranding={!plan.removeBranding}
      theme={publicTheme(page.organization)}
      pixels={plan.pixels ? { meta: page.organization.metaPixelId, tiktok: page.organization.tiktokPixelId, ga4: page.organization.ga4Id, contentName: `Bio - ${page.title}` } : null}
    />
  );
}
