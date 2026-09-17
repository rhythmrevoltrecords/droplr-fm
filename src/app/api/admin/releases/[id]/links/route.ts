import { NextResponse, type NextRequest } from "next/server";
import { labelRelease } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { blankToNull, linksPayloadSchema } from "@/lib/link-input";

/**
 * Replace the ordered link list (array order = position).
 * Rows keep their ids when edited, so custom-link URLs already shared (/api/r/…?l={id}) keep working.
 * Hidden rows (visible=false) stay in the editor and are skipped on the public page.
 */
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await labelRelease(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const parsed = linksPayloadSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: [...new Set(parsed.error.issues.map((i) => i.message))].join("; ") }, { status: 400 });

  const existing = await prisma.releaseLink.findMany({ where: { releaseId: g.release.id }, select: { id: true } });
  const existingIds = new Set(existing.map((e) => e.id));
  const keep = new Set(parsed.data.links.map((l) => l.id).filter((id): id is string => !!id && existingIds.has(id)));

  await prisma.$transaction([
    prisma.releaseLink.deleteMany({ where: { releaseId: g.release.id, id: { notIn: [...keep] } } }),
    ...parsed.data.links.map((l, position) => {
      const data = {
        platform: l.platform,
        url: l.url,
        title: blankToNull(l.title),
        buttonText: blankToNull(l.buttonText),
        icon: blankToNull(l.icon),
        visible: l.visible,
        isCustom: l.platform === "custom",
        position,
      };
      return l.id && keep.has(l.id)
        ? prisma.releaseLink.update({ where: { id: l.id }, data })
        : prisma.releaseLink.create({ data: { ...data, releaseId: g.release.id } });
    }),
  ]);
  const links = await prisma.releaseLink.findMany({ where: { releaseId: g.release.id }, orderBy: { position: "asc" } });
  return NextResponse.json({ ok: true, links });
}
