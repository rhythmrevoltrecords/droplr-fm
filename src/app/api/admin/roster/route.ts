import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { artistCreateInput, artistLimitMessage, artistLimitReached, definedOnly, zodError } from "@/lib/artists";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Add an artist to the roster. No login needed; invite them later from their profile. */
export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const parsed = artistCreateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: zodError(parsed.error) }, { status: 400 });
  if (await artistLimitReached(user.organizationId, user.organization.plan)) return NextResponse.json({ error: artistLimitMessage(user.organization.plan) }, { status: 402 });

  const { socialLinks, monthlyListeners, followers, ...rest } = parsed.data;
  const hasStats = monthlyListeners != null || followers != null;
  const artist = await prisma.artist.create({
    data: {
      ...definedOnly(rest),
      name: rest.name,
      organizationId: user.organizationId,
      socialLinks: socialLinks ?? Prisma.DbNull,
      monthlyListeners: monthlyListeners ?? null,
      followers: followers ?? null,
      statsUpdatedAt: hasStats ? new Date() : null,
    },
  });
  return NextResponse.json({ id: artist.id });
}
