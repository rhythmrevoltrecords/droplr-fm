import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { bioSchema } from "@/lib/bio";
import { extractAccentColor } from "@/lib/color";
import { prisma } from "@/lib/db";
import { RESERVED_SLUGS, slugify } from "@/lib/utils";



export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const parsed = bioSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  const d = parsed.data;
  const slug = slugify(d.slug);
  if (!slug || RESERVED_SLUGS.has(slug)) return NextResponse.json({ error: "That slug is reserved" }, { status: 400 });
  if (await prisma.bioPage.findUnique({ where: { slug } })) return NextResponse.json({ error: "Slug already taken" }, { status: 409 });

  // Same system as releases: accent comes from the artwork (sharp hue histogram).
  const accentColor = d.accentColor || (await extractAccentColor(d.imageUrl));
  const page = await prisma.bioPage.create({
    data: { organizationId: user.organizationId, slug, title: d.title, bio: d.bio || null, imageUrl: d.imageUrl, accentColor, isPublic: d.isPublic ?? true },
  });
  return NextResponse.json({ id: page.id });
}
