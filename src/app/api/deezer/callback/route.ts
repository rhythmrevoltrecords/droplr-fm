import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { deezerGloballyEnabled } from "@/lib/env";
import { deezerExchange, deezerMe } from "@/lib/deezer";
import { unpackState, withParam } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const state = unpackState(sp.get("state"));
  if (!state) return NextResponse.json({ error: "Invalid or expired state" }, { status: 400 });
  if (!deezerGloballyEnabled() || !sp.get("code")) return NextResponse.redirect(withParam(state.ret, "notice", "error"));
  try {
    const token = await deezerExchange(sp.get("code")!);
    const userId = await deezerMe(token);
    const existing = userId ? await prisma.preSave.findFirst({ where: { releaseId: state.rid, platform: "deezer", deezerUserId: userId } }) : null;
    const data = { refreshTokenEncrypted: encrypt(token), email: state.em ?? null, emailConsent: !!state.em, sourceVariantId: state.vid ?? null, source: state.src ?? null, anonId: state.anon ?? null };
    if (existing) await prisma.preSave.update({ where: { id: existing.id }, data });
    else await prisma.preSave.create({ data: { ...data, releaseId: state.rid, platform: "deezer", deezerUserId: userId, status: "pending" } });
    return NextResponse.redirect(withParam(state.ret, "done", "deezer"));
  } catch (e) {
    console.error("[deezer callback]", e);
    return NextResponse.redirect(withParam(state.ret, "notice", "error"));
  }
}
