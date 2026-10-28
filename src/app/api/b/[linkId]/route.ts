import { after, NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isSuspended } from "@/lib/account-standing";
import { capText, requestMeta, resolveSource, ANON_COOKIE } from "@/lib/tracking";
import { requestOrigin } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/**
 * A tap on a bio page button: redirect first, count afterwards. Works with JS off.
 *
 * The counting used to be AWAITED before the redirect, which put a write to Neon in Sydney on
 * the critical path of every outbound tap — the fan waited for droplr's bookkeeping before they
 * reached Spotify. The release route fixed exactly this once already, with exactly this comment,
 * and the bio route never got the same treatment. `after()` registers the work before the
 * response and runs it once the response is sent.
 *
 * The trade is that a tap can be lost if the function is torn down before `after()` finishes.
 * That is the right way round: a fan who is kept waiting may leave for good, a missing analytics
 * row is a missing row.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ linkId: string }> }) {
  const params = await props.params;
  const link = await prisma.bioLink.findUnique({
    where: { id: params.linkId },
    include: { bioPage: { select: { id: true, isPublic: true, organization: { select: { suspendedAt: true } } } } },
  });
  if (!link || !link.isActive || !link.bioPage.isPublic || isSuspended(link.bioPage.organization) || !/^https?:\/\//i.test(link.url)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const meta = requestMeta(req.headers);
  if (!meta.bot) {
    const q = req.nextUrl.searchParams;
    const { host } = requestOrigin(req);
    // Captured now: the request may not outlive the response.
    const logged = {
      bioPageId: link.bioPage.id,
      bioLinkId: link.id,
      platform: link.platform,
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
      await prisma.$transaction([
        prisma.clickEvent.create({ data: logged }),
        // The integer stays. It counts every tap since bio pages existed, including all the ones
        // from before this table knew about them, and no ClickEvent row can be written for those
        // retrospectively. Two numbers answering two questions, both of them true.
        prisma.bioLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } }),
      ]).catch(() => {});
    });
  }
  return NextResponse.redirect(link.url, 302);
}
