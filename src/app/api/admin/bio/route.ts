import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { BIO_PAGE_LIMIT_MESSAGE, bioPageLimit, bioSchema } from "@/lib/bio";
import { storedOrder } from "@/lib/bio-sections";
import { extractAccentColor } from "@/lib/color";
import { prisma } from "@/lib/db";
import { RESERVED_SLUGS, slugify } from "@/lib/utils";



export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  // One page per artist account. Checked before anything is written, and server-side rather than
  // only in the UI: hiding a button is not a limit.
  const limit = bioPageLimit(user.organization.kind);
  if (Number.isFinite(limit) && (await prisma.bioPage.count({ where: { organizationId: user.organizationId } })) >= limit) {
    return NextResponse.json({ error: BIO_PAGE_LIMIT_MESSAGE }, { status: 409 });
  }

  const parsed = bioSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  const d = parsed.data;
  const slug = slugify(d.slug);
  if (!slug || RESERVED_SLUGS.has(slug)) return NextResponse.json({ error: "That page address is reserved. Try another." }, { status: 400 });
  if (await prisma.bioPage.findUnique({ where: { slug } })) return NextResponse.json({ error: "Someone already has that page address. Try another." }, { status: 409 });

  // Same tenant check as the PATCH route: a cuid from another label's roster would scope this
  // page's release block to releases that are not this organisation's.
  if (d.artistProfileId && !(await prisma.artist.findFirst({ where: { id: d.artistProfileId, organizationId: user.organizationId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Unknown artist" }, { status: 400 });
  }

  // Same system as releases: accent comes from the artwork (sharp hue histogram).
  const accentColor = d.accentColor || (await extractAccentColor(d.imageUrl));
  const page = await prisma.bioPage.create({
    data: { organizationId: user.organizationId, slug, title: d.title, bio: d.bio || null, imageUrl: d.imageUrl, accentColor, theme: d.theme || null, font: d.font || null, artistProfileId: d.artistProfileId || null, releaseBlock: d.releaseBlock || null, backgroundUrl: d.backgroundUrl || null, backgroundColor: d.backgroundColor || null, buttonColor: d.buttonColor || null, labelBadge: d.labelBadge || null, subscribe: d.subscribe || null, subscribeText: d.subscribeText || null, sectionOrder: storedOrder(d.sectionOrder), gallery: d.gallery || null, galleryAt: d.gallery ? new Date() : null, isPublic: d.isPublic ?? true },
  });
  return NextResponse.json({ id: page.id });
}
