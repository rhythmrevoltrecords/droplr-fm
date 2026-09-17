import { NextResponse, type NextRequest } from "next/server";
import { labelRelease } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await labelRelease(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const body = (await req.json()) as { slug?: string; source?: string; utm_campaign?: string };
  const slug = slugify(body.slug ?? "");
  if (!slug) return NextResponse.json({ error: "Slug required" }, { status: 400 });
  const exists = await prisma.linkVariant.findUnique({ where: { releaseId_slug: { releaseId: g.release.id, slug } } });
  if (exists) return NextResponse.json({ error: "Variant exists" }, { status: 409 });
  const v = await prisma.linkVariant.create({
    data: { releaseId: g.release.id, slug, source: slugify(body.source || slug) || slug, utm_campaign: body.utm_campaign || null },
  });
  return NextResponse.json(v);
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await labelRelease(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const variantId = req.nextUrl.searchParams.get("variantId") ?? "";
  await prisma.linkVariant.deleteMany({ where: { id: variantId, releaseId: g.release.id } });
  return NextResponse.json({ ok: true });
}
