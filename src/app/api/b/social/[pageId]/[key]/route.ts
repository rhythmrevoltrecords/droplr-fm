import { after, NextResponse, type NextRequest } from "next/server";
import { socialSource } from "@/lib/bio-socials-server";
import { iconPlatform, showSocials, socialTarget } from "@/lib/bio-socials";
import type { SocialKey } from "@/lib/artist-fields";
import { prisma } from "@/lib/db";
import { isSuspended } from "@/lib/account-standing";
import { requestOrigin } from "@/lib/oauth";
import { ANON_COOKIE, capText, requestMeta, resolveSource } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * A tap on a social icon: redirect first, count afterwards, exactly like /api/b/<linkId>.
 *
 * The destination is never read from the request. It is looked up on the profile the page itself
 * shows icons from, so this cannot be turned into an open redirect by editing the URL: an unknown
 * page, a private page, a page with the row switched off, or a key that page has no icon for are
 * all the same 404.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ pageId: string; key: string }> }) {
  const { pageId, key } = await props.params;
  const page = await prisma.bioPage.findUnique({
    where: { id: pageId },
    select: { id: true, isPublic: true, socialIcons: true, organizationId: true, artistProfileId: true, organization: { select: { kind: true, suspendedAt: true } } },
  });
  if (!page || !page.isPublic || isSuspended(page.organization) || !showSocials(page)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const target = socialTarget(await socialSource(page, page.organization.kind), key);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const meta = requestMeta(req.headers);
  if (!meta.bot) {
    const q = req.nextUrl.searchParams;
    const { host } = requestOrigin(req);
    const logged = {
      bioPageId: page.id,
      // No bioLinkId: an icon is not a BioLink row. The platform is what the stats group it by.
      platform: iconPlatform(key as SocialKey),
      source: resolveSource({ utmSource: q.get("utm_source"), referrer: meta.referrer, selfHosts: [host] }),
      utm_source: capText(q.get("utm_source")),
      utm_medium: capText(q.get("utm_medium")),
      utm_campaign: capText(q.get("utm_campaign")),
      referrer: meta.referrer?.slice(0, 500),
      country: meta.country,
      timezone: meta.timezone,
      deviceType: meta.deviceType,
      ipHash: meta.ipHash,
      anonId: req.cookies.get(ANON_COOKIE)?.value ?? null,
    };
    after(async () => {
      await prisma.clickEvent.create({ data: logged }).catch(() => {});
    });
  }
  return NextResponse.redirect(target, 302);
}
