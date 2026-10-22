import { NextResponse, type NextRequest } from "next/server";
import { labelRelease } from "@/lib/admin-guard";
import { isOwnImage } from "@/lib/bio-items";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { lookUpdate, pageLookSchema } from "@/lib/page-look";
import { planOf } from "@/lib/plans";
import { backgroundPatch } from "@/lib/background-blur";
import { z } from "zod";

const schema = pageLookSchema.extend({ socialIcons: z.enum(["on"]).nullable().optional().or(z.literal("")) }).strict();

/**
 * Save a release or download page's look (the Look tab).
 *
 * Gated on SAVING a look, not on serving one. A page styled on a paid plan keeps its look after a
 * downgrade: fans who already saw it shouldn't watch it change because a card expired. Putting a
 * page back to the default is always allowed, so a downgraded account can still undo its look.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const got = await labelRelease((await ctx.params).id);
  if ("error" in got) return NextResponse.json({ error: got.error }, { status: got.status });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "That look couldn't be saved." }, { status: 400 });
  const { socialIcons, backgroundBlur, ...lookInput } = parsed.data;
  const data: Record<string, string | null> = lookUpdate(lookInput);

  // Only images droplr stored itself. An outside URL would put a third party's request on every
  // fan's visit to the page, which is a tracking pixel by another name.
  if (data.backgroundUrl && !isOwnImage(data.backgroundUrl, SITE_URL)) {
    return NextResponse.json({ error: "Upload the background here rather than linking to it." }, { status: 400 });
  }

  // A blur level counts as setting something: on its own it would change how the page looks.
  const setsSomething = Object.values(data).some((v) => v !== null) || (!!backgroundBlur && backgroundBlur !== "none");
  if (setsSomething) {
    const org = await prisma.organization.findUnique({ where: { id: got.release.organizationId }, select: { plan: true } });
    if (!planOf(org?.plan).pageLooks) {
      return NextResponse.json({ error: "Your own page look is on the paid plans. Free pages use the colour from your artwork." }, { status: 402 });
    }
  }

  // The background is sent as the ORIGINAL upload plus a level; the shown image may be a blurred
  // copy made here. Done after the plan check, so a refused request never runs sharp or stores a file.
  const bg = await backgroundPatch({ backgroundUrl: "backgroundUrl" in data ? data.backgroundUrl : undefined, backgroundBlur }, got.release);
  if (!bg.ok) return NextResponse.json({ error: bg.error }, { status: 400 });
  Object.assign(data, bg.patch);

  // The icon row's on/off switch is not part of the paid look: it was free in Settings before the
  // Look tab existed, so it stays free, and it is deliberately outside the plan check above.
  const release = await prisma.release.update({
    where: { id: got.release.id },
    data: { ...data, ...(socialIcons !== undefined ? { socialIcons: socialIcons || null } : {}) },
    select: { backgroundSourceUrl: true, backgroundBlur: true, theme: true, font: true, backgroundUrl: true, backgroundColor: true, buttonColor: true, glowColor: true, textColor: true, iconStyle: true, iconColor: true, socialIcons: true },
  });
  return NextResponse.json(release);
}
