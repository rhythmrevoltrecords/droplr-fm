import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { labelRelease } from "@/lib/admin-guard";
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

/** Replace the whole ordered link list (array order = display order). */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await labelRelease(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  await prisma.$transaction([
    prisma.platformLink.deleteMany({ where: { releaseId: g.release.id } }),
    prisma.platformLink.createMany({
      data: parsed.data.links.map((l, i) => ({ releaseId: g.release.id, platform: l.platform, url: l.url, label: l.label ?? null, isActive: l.isActive, isCustom: l.platform === "custom", order: i })),
    }),
  ]);
  return NextResponse.json({ ok: true });
}
