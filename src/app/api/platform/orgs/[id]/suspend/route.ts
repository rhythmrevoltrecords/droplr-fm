import { after, NextResponse, type NextRequest } from "next/server";
import { bioPublicUrl } from "@/lib/bio";
import { SITE_URL } from "@/lib/env";
import { indexNowOn, pingIndexNow } from "@/lib/indexnow-server";
import { publicReleaseUrl } from "@/lib/release-url";
import { HAS_PUBLIC_MUSIC, suspendBlocker } from "@/lib/account-standing";
import { prisma } from "@/lib/db";
import { platformAdmin } from "@/lib/platform";
import { isPlatformAdminEmail } from "@/lib/platform-emails";
import { internalSlugs } from "@/lib/platform-stats";

export const dynamic = "force-dynamic";

/**
 * POST { suspended: boolean, reason?: string } — platform owner only.
 *
 * Suspending hides every public page, link and gate of the account and signs its logins out
 * (lib/account-standing). Lifting it brings all of it back as it was: nothing is deleted either way.
 * Refused for droplr's own accounts, an account a platform admin logs in to, and one paying
 * through Stripe (see suspendBlocker). Lifting is never refused.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const admin = await platformAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await props.params;
  const b = (await req.json().catch(() => ({}))) as { suspended?: unknown; reason?: unknown };
  if (typeof b.suspended !== "boolean") return NextResponse.json({ error: "Send suspended: true or false" }, { status: 400 });

  const org = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, slug: true, stripeSubscriptionId: true, suspendedAt: true, users: { select: { email: true } } },
  });
  if (!org) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  if (b.suspended) {
    const blocked = suspendBlocker(org, { internalSlugs: internalSlugs(), hasPlatformAdmin: org.users.some((u) => isPlatformAdminEmail(u.email)) });
    if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
    const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 200) || null : null;
    // Already suspended: keep the original when, who and why rather than overwrite them.
    if (!org.suspendedAt) await prisma.organization.update({ where: { id }, data: { suspendedAt: new Date(), suspendedBy: admin.email, suspendReason: reason } });
  } else {
    await prisma.organization.update({ where: { id }, data: { suspendedAt: null, suspendedBy: null, suspendReason: null } });
  }
  // Either way, the public addresses just changed (404 now, or back): ask IndexNow's engines to look
  // again, so a suspended page drops out of Bing within days rather than whenever it's next crawled.
  if (indexNowOn()) {
    const o = await prisma.organization.findUnique({
      where: { id },
      select: {
        slug: true, customDomain: true, plan: true, planUpdatedAt: true, customDomainLiveAt: true,
        releases: { where: { isPublic: true, status: "live" }, select: { slug: true }, take: 500 },
        bioPages: { where: { isPublic: true }, select: { slug: true } },
        _count: { select: { releases: { where: HAS_PUBLIC_MUSIC.releases.some } } },
      },
    });
    // On lifting, an account with no music has its bio pages left unannounced, as everywhere else.
    if (o && !b.suspended && o._count.releases === 0) o.bioPages = [];
    if (o) after(() => pingIndexNow([...o.releases.map((r) => publicReleaseUrl(o, r.slug, SITE_URL)), ...o.bioPages.map((p) => bioPublicUrl(o, p.slug))]));
  }
  console.info("[platform] suspend", { org: id, suspended: b.suspended, by: admin.email });
  return NextResponse.json({ ok: true });
}
