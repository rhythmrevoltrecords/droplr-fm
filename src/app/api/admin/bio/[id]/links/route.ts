import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { blankToNull, linksPayloadSchema } from "@/lib/link-input";

/** Same editor payload as release links; stored on BioLink (title→label, visible→isActive). Ids and click counts are kept. */
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const page = await prisma.bioPage.findFirst({ where: { id: params.id, organizationId: user.organizationId }, include: { links: { select: { id: true } } } });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = linksPayloadSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: [...new Set(parsed.error.issues.map((i) => i.message))].join("; ") }, { status: 400 });

  const existingIds = new Set(page.links.map((l) => l.id));
  const keep = new Set(parsed.data.links.map((l) => l.id).filter((id): id is string => !!id && existingIds.has(id)));
  await prisma.$transaction([
    prisma.bioLink.deleteMany({ where: { bioPageId: page.id, id: { notIn: [...keep] } } }),
    ...parsed.data.links.map((l, order) => {
      const data = { platform: l.platform, url: l.url, label: blankToNull(l.title), buttonText: blankToNull(l.buttonText), icon: blankToNull(l.icon), isActive: l.visible, order };
      return l.id && keep.has(l.id)
        ? prisma.bioLink.update({ where: { id: l.id }, data })
        : prisma.bioLink.create({ data: { ...data, bioPageId: page.id } });
    }),
  ]);
  const links = await prisma.bioLink.findMany({ where: { bioPageId: page.id }, orderBy: { order: "asc" } });
  return NextResponse.json({ ok: true, links: links.map((l) => ({ id: l.id, platform: l.platform, url: l.url, title: l.label, buttonText: l.buttonText, icon: l.icon, visible: l.isActive })) });
}
