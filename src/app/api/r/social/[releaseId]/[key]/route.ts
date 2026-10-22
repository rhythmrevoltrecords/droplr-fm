import { after, NextResponse, type NextRequest } from "next/server";
import type { SocialKey } from "@/lib/artist-fields";
import { prisma } from "@/lib/db";
import { requestOrigin } from "@/lib/oauth";
import { iconPlatform, showSocials, socialTarget } from "@/lib/bio-socials";
import { socialSource } from "@/lib/bio-socials-server";
import { ANON_COOKIE, capText, requestMeta, resolveSource } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * A tap on a social icon on a release page: redirect first, count afterwards. The release twin of
 * /api/b/social, with the same rule: the destination is never read from the request, only from the
 * profile the release itself shows icons from, inside the release's own organisation. Download gates
 * can show the row too since the Look tab (an artist profile link gives nothing of the file away).
 * Unknown or private page, any other kind, the box switched off, or a key with no https address on
 * the profile are all the same 404.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ releaseId: string; key: string }> }) {
  const { releaseId, key } = await props.params;
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: { id: true, kind: true, isPublic: true, socialIcons: true, organizationId: true, artistProfileId: true, organization: { select: { kind: true } } },
  });
  if (!release || !release.isPublic || (release.kind !== "release" && release.kind !== "download") || !showSocials(release)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const target = socialTarget(await socialSource(release, release.organization.kind), key);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const meta = requestMeta(req.headers);
  if (!meta.bot) {
    const q = req.nextUrl.searchParams;
    const { host } = requestOrigin(req);
    const logged = {
      releaseId: release.id,
      // No linkId: an icon is not a ReleaseLink. lib/analytics names it by this prefix and keeps
      // it out of the per-store breakdown, because following an artist is not choosing a store.
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
      anonId: req.cookies.get(ANON_COOKIE)?.value ?? req.headers.get("x-anon-id"),
    };
    after(async () => {
      await prisma.clickEvent.create({ data: logged }).catch(() => {});
    });
  }
  return NextResponse.redirect(target, 302);
}
