import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isBot } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/** Bio link click: count server-side, then redirect. Works with JS off. */
export async function GET(req: NextRequest, { params }: { params: { linkId: string } }) {
  const link = await prisma.bioLink.findUnique({ where: { id: params.linkId }, include: { bioPage: { select: { isPublic: true } } } });
  if (!link || !link.isActive || !link.bioPage.isPublic || !/^https?:\/\//i.test(link.url)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isBot(req.headers.get("user-agent"))) {
    await prisma.bioLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } });
  }
  return NextResponse.redirect(link.url, 302);
}
