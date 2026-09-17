import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { isAllowedReturnUrl, requestOrigin } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** Short link by release id: /r/{id} → 301 /{orgSlug}/{releaseSlug} (query string kept). */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const release = await prisma.release.findUnique({ where: { id: params.id }, select: { slug: true, isPublic: true, organization: { select: { slug: true } } } });
  if (!release || !release.isPublic) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // On a label's custom domain the short form is canonical: presave.label.com/{releaseSlug}
  const { origin, tenant } = requestOrigin(req);
  // origin comes from the Host header and this 301 gets cached: never redirect to a host that isn't ours.
  const ours = await isAllowedReturnUrl(origin);
  const url = new URL(ours && tenant ? `/${release.slug}` : `/${release.organization.slug}/${release.slug}`, ours ? origin : SITE_URL);
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));
  return NextResponse.redirect(url, 301);
}
