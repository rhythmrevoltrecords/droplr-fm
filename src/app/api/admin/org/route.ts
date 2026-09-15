import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";

const id = z.string().max(40).regex(/^[A-Za-z0-9_-]*$/, "Letters, numbers, - and _ only");
const schema = z.object({
  name: z.string().min(2).max(100).optional(),
  metaPixelId: id.optional(),
  tiktokPixelId: id.optional(),
  ga4Id: id.optional(),
  customDomain: z.string().max(253).regex(/^$|^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i, "Enter a hostname like presave.yourlabel.com").optional(),
  emailFromName: z.string().max(80).optional(),
  emailReplyTo: z.string().email().or(z.literal("")).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const d = parsed.data;
  const plan = planOf(user.organization.plan);
  if ((d.metaPixelId || d.tiktokPixelId || d.ga4Id) && !plan.pixels) return NextResponse.json({ error: "Pixels are on Pro and above" }, { status: 402 });
  if (d.customDomain && !plan.customDomain) return NextResponse.json({ error: "Custom domains are on Pro and above" }, { status: 402 });
  const domain = d.customDomain?.toLowerCase().trim();
  if (domain) {
    if (domain === "droplr.fm" || domain.endsWith(".droplr.fm")) return NextResponse.json({ error: "Use your own domain" }, { status: 400 });
    const clash = await prisma.organization.findUnique({ where: { customDomain: domain } });
    if (clash && clash.id !== user.organizationId) return NextResponse.json({ error: "Domain already connected to another label" }, { status: 409 });
  }
  await prisma.organization.update({
    where: { id: user.organizationId },
    data: {
      ...(d.name !== undefined && { name: d.name }),
      ...(d.metaPixelId !== undefined && { metaPixelId: d.metaPixelId || null }),
      ...(d.tiktokPixelId !== undefined && { tiktokPixelId: d.tiktokPixelId || null }),
      ...(d.ga4Id !== undefined && { ga4Id: d.ga4Id || null }),
      ...(d.customDomain !== undefined && { customDomain: domain || null }),
      ...(d.emailFromName !== undefined && { emailFromName: d.emailFromName || null }),
      ...(d.emailReplyTo !== undefined && { emailReplyTo: d.emailReplyTo || null }),
    },
  });
  return NextResponse.json({ ok: true });
}
