import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requestOrigin } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** Short link by release id: /r/{id} → 301 /{orgSlug}/{releaseSlug} (query string kept). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const release = await prisma.release.findUnique({ where: { id: params.id }, select: { slug: true, isPublic: true, organization: { select: { slug: true } } } });
  if (!release || !release.isPublic) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // On a label's custom domain the short form is canonical: presave.label.com/{releaseSlug}
  const { origin, tenant } = requestOrigin(req);
  const url = new URL(tenant ? `/${release.slug}` : `/${release.organization.slug}/${release.slug}`, origin);
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));
  return NextResponse.redirect(url, 301);
}
