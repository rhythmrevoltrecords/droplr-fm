import { hasBeta } from "@/lib/beta";
import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { noticeDay, parseAgreement } from "@/lib/agreements";
import { agreementData, ownedRefs } from "@/lib/agreements-server";

export const dynamic = "force-dynamic";

/** The caller's own agreement, or nothing. Another label's id is a 404, never a 403. */
async function own(props: { params: Promise<{ id: string }> }) {
  const user = await apiUser("label");
  if (!user) return { fail: { error: "Unauthorised", status: 401 } };
  if (!hasBeta(user.organization, "agreements")) return { fail: { error: "Not found", status: 404 } };
  const { id } = await props.params;
  const a = await prisma.agreement.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true, endsOn: true, noticeDays: true, status: true } });
  if (!a) return { fail: { error: "Not found", status: 404 } };
  return { fail: null, user, a };
}

/** PATCH: edit any field, or replace the releases it covers. Never gated: a downgrade can always keep its records straight. */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const g = await own(props);
  if (g.fail) return NextResponse.json({ error: g.fail.error }, { status: g.fail.status });
  const parsed = parseAgreement(await req.json().catch(() => null), true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const f = parsed.ok;
  const bad = await ownedRefs(g.user.organizationId, f);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const data: Record<string, unknown> = agreementData(f);
  // The start date moving past the end date is checked against what's stored, not just the form.
  const current = await prisma.agreement.findUnique({ where: { id: g.a.id }, select: { startsOn: true, endsOn: true } });
  const starts = f.startsOn !== undefined ? f.startsOn : current?.startsOn ?? null;
  const ends = f.endsOn !== undefined ? f.endsOn : current?.endsOn ?? null;
  if (starts && ends && ends < starts) return NextResponse.json({ error: "The end date is before the start date." }, { status: 400 });
  // A new notice day is a new reminder. Only the day counts: typing 30 into a blank notice field,
  // or flipping the status and back, changes nothing a reminder is about and mustn't send it again.
  const before = noticeDay(g.a)?.getTime() ?? null;
  const after = noticeDay({ endsOn: ends, noticeDays: f.noticeDays !== undefined ? f.noticeDays : g.a.noticeDays })?.getTime() ?? null;
  if (before !== after) data.noticeRemindedAt = null;
  await prisma.$transaction([
    prisma.agreement.update({ where: { id: g.a.id }, data }),
    ...(f.releaseIds ? [
      prisma.agreementRelease.deleteMany({ where: { agreementId: g.a.id, releaseId: { notIn: f.releaseIds } } }),
      prisma.agreementRelease.createMany({ data: f.releaseIds.map((releaseId) => ({ agreementId: g.a.id, releaseId })), skipDuplicates: true }),
    ] : []),
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const g = await own(props);
  if (g.fail) return NextResponse.json({ error: g.fail.error }, { status: g.fail.status });
  await prisma.agreement.delete({ where: { id: g.a.id } });
  return NextResponse.json({ ok: true });
}
