import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPlatformKey } from "@/lib/platforms";

const schema = z.object({
  links: z.array(z.object({
    platform: z.string().refine(isPlatformKey, "Unknown platform"),
    url: z.string().url().refine((u) => /^https?:\/\//i.test(u), "http(s) only"),
    label: z.string().max(60).nullable().optional(),
    isActive: z.boolean(),
  })).max(40),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const page = await prisma.bioPage.findFirst({ where: { id: params.id, organizationId: user.organizationId }, include: { links: true } });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });

  // Keep click counts for links that survive the edit (matched by url)
  const clicksByUrl = new Map(page.links.map((l) => [l.url, l.clicks]));
  await prisma.$transaction([
    prisma.bioLink.deleteMany({ where: { bioPageId: page.id } }),
    prisma.bioLink.createMany({
      data: parsed.data.links.map((l, i) => ({ bioPageId: page.id, platform: l.platform, url: l.url, label: l.label ?? null, isActive: l.isActive, order: i, clicks: clicksByUrl.get(l.url) ?? 0 })),
    }),
  ]);
  return NextResponse.json({ ok: true });
}
