import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { bioSchema } from "@/lib/bio";
import { storedOrder } from "@/lib/bio-sections";
import { extractAccentColor } from "@/lib/color";
import { prisma } from "@/lib/db";
import { RESERVED_SLUGS, slugify } from "@/lib/utils";

async function guard(id: string) {
  const user = await apiUser("label");
  if (!user) return null;
  const page = await prisma.bioPage.findFirst({ where: { id, organizationId: user.organizationId } });
  return page ? { user, page } : null;
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard(params.id);
  if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = bioSchema.partial().safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const d = parsed.data;
  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = d.title;
  if (d.bio !== undefined) data.bio = d.bio || null;
  if (d.isPublic !== undefined) data.isPublic = d.isPublic;
  // Empty string or null both mean "back to the default look", which is NULL in the column.
  if (d.theme !== undefined) data.theme = d.theme || null;
  if (d.font !== undefined) data.font = d.font || null;
  if (d.releaseBlock !== undefined) data.releaseBlock = d.releaseBlock || null;
  if (d.subscribe !== undefined) data.subscribe = d.subscribe || null;
  if (d.socialIcons !== undefined) data.socialIcons = d.socialIcons || null;
  if (d.subscribeText !== undefined) data.subscribeText = d.subscribeText || null;
  if (d.sectionOrder !== undefined) data.sectionOrder = storedOrder(d.sectionOrder);
  if (d.gallery !== undefined) {
    data.gallery = d.gallery || null;
    // Stamped only on the switch from off to on. Saving the page again for some other reason must
    // not move it back to the top of the gallery, or the list would reward pressing Save.
    if (d.gallery && g.page.gallery !== "on") data.galleryAt = new Date();
    if (!d.gallery) data.galleryAt = null;
  }
  if (d.backgroundUrl !== undefined) data.backgroundUrl = d.backgroundUrl || null;
  if (d.backgroundColor !== undefined) data.backgroundColor = d.backgroundColor || null;
  if (d.buttonColor !== undefined) data.buttonColor = d.buttonColor || null;
  if (d.textColor !== undefined) data.textColor = d.textColor || null;
  if (d.glowColor !== undefined) data.glowColor = d.glowColor || null;
  // "plain" is the row as it always was, so it is stored as NULL like every other default.
  if (d.iconStyle !== undefined) data.iconStyle = d.iconStyle && d.iconStyle !== "plain" ? d.iconStyle : null;
  if (d.iconColor !== undefined) data.iconColor = d.iconColor || null;
  // Only the artist's half. The label's half (Artist.labelBadge + an active roster row) is read
  // at render time, so a label revoking it takes effect without touching this column.
  if (d.labelBadge !== undefined) data.labelBadge = d.labelBadge || null;
  if (d.artistProfileId !== undefined) {
    // Tenant check, not just a type check: a cuid from another label's roster would otherwise
    // scope this page's release block to releases that are not this organisation's.
    const id = d.artistProfileId || null;
    if (id && !(await prisma.artist.findFirst({ where: { id, organizationId: g.user.organizationId }, select: { id: true } }))) {
      return NextResponse.json({ error: "Unknown artist" }, { status: 400 });
    }
    data.artistProfileId = id;
  }
  if (d.slug !== undefined) {
    const slug = slugify(d.slug);
    if (!slug || RESERVED_SLUGS.has(slug)) return NextResponse.json({ error: "That page address is reserved. Try another." }, { status: 400 });
    const clash = await prisma.bioPage.findUnique({ where: { slug } });
    if (clash && clash.id !== g.page.id) return NextResponse.json({ error: "Someone already has that page address. Try another." }, { status: 409 });
    data.slug = slug;
  }
  if (d.imageUrl !== undefined) {
    data.imageUrl = d.imageUrl;
    // New artwork → re-extract unless the upload already returned a vibrant colour
    data.accentColor = d.accentColor || (d.imageUrl !== g.page.imageUrl ? await extractAccentColor(d.imageUrl) : g.page.accentColor);
  } else if (d.accentColor !== undefined) {
    data.accentColor = d.accentColor || null;
  }
  await prisma.bioPage.update({ where: { id: g.page.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard(params.id);
  if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.bioPage.delete({ where: { id: g.page.id } });
  return NextResponse.json({ ok: true });
}
