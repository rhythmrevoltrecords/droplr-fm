import { NextResponse, type NextRequest } from "next/server";
import { storedPlan } from "@/lib/billing";
import { prisma } from "@/lib/db";
import { platformAdmin } from "@/lib/platform";
import { accountKind, isAccountKind, isPlanKey, kindChangeBlocker, PLANS_FOR, type AccountKind } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * PATCH — platform owner only. Send either or both:
 *   { compPlan: <a paid plan for the account's type> | null, compNote?: string }
 *   { kind: "label" | "artist" }  switch account type (blocked while a Stripe subscription or other-type comp exists)
 */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const admin = await platformAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { compPlan?: unknown; compNote?: unknown; kind?: unknown };
  const hasComp = "compPlan" in body;
  const hasKind = "kind" in body;
  if (!hasComp && !hasKind) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  if (hasKind && !isAccountKind(body.kind)) return NextResponse.json({ error: "kind must be label or artist" }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { id: params.id }, select: { id: true, kind: true, stripeSubscriptionId: true, stripePriceId: true, compPlan: true, compNote: true } });
  if (!org) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const kind: AccountKind = hasKind ? (body.kind as AccountKind) : accountKind(org.kind);
  let compPlan = org.compPlan;
  let compNote = org.compNote;
  if (hasComp) {
    const raw = body.compPlan === null || body.compPlan === "" || body.compPlan === "none" ? null : body.compPlan;
    if (raw !== null && (!isPlanKey(raw) || raw === "free" || !PLANS_FOR[kind].includes(raw))) {
      return NextResponse.json({ error: `compPlan must be one of ${PLANS_FOR[kind].filter((p) => p !== "free").join(", ")} or null for a ${kind} account` }, { status: 400 });
    }
    compPlan = raw as string | null;
    compNote = compPlan && typeof body.compNote === "string" ? body.compNote.trim().slice(0, 200) || null : null;
  }

  if (hasKind) {
    const blocked = kindChangeBlocker({ ...org, compPlan }, kind);
    if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
  }

  const plan = storedPlan({ ...org, compPlan });
  const updated = await prisma.organization.update({
    where: { id: org.id },
    data: {
      kind,
      plan,
      planUpdatedAt: new Date(),
      ...(hasComp ? { compPlan, compNote, compSetAt: new Date(), compSetBy: admin.email } : {}),
    },
    select: { id: true, kind: true, plan: true, compPlan: true, compNote: true },
  });
  console.info("[platform] account update", { org: org.id, kind: hasKind ? `${org.kind}→${kind}` : undefined, compPlan: hasComp ? compPlan : undefined, plan, by: admin.email });
  return NextResponse.json({ ok: true, org: updated });
}
