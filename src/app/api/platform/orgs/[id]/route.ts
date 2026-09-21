import { NextResponse, type NextRequest } from "next/server";
import { storedPlan } from "@/lib/billing";
import { prisma } from "@/lib/db";
import { platformAdmin } from "@/lib/platform";
import { accountKind, isAccountKind, isPlanKey, kindChangeBlocker, PLANS_FOR, type AccountKind } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * PATCH — platform owner only. Send either or both:
 *   { compPlan: <a paid plan for the account's type> | null, compNote?: string,
 *     compDays?: number | null  — days from now the comp lapses; null/0 means no end date
 *     founderPrice?: string    — what they pay after, in your words, shown in the "comp ended" notice
 *     claimDays?: number       — days after the comp ends that the rate can still be claimed; 0 = no deadline
 *     founderCode?: string     — Stripe promotion code that applies it at checkout }
 *   { kind: "label" | "artist" }  switch account type (blocked while a Stripe subscription or other-type comp exists)
 */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const admin = await platformAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { compPlan?: unknown; compNote?: unknown; kind?: unknown; compDays?: unknown; founderPrice?: unknown; claimDays?: unknown; founderCode?: unknown };
  const hasComp = "compPlan" in body;
  const hasKind = "kind" in body;
  if (!hasComp && !hasKind) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  if (hasKind && !isAccountKind(body.kind)) return NextResponse.json({ error: "kind must be label or artist" }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { id: params.id }, select: { id: true, kind: true, stripeSubscriptionId: true, stripePriceId: true, compPlan: true, compNote: true, compUntil: true } });
  if (!org) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const kind: AccountKind = hasKind ? (body.kind as AccountKind) : accountKind(org.kind);
  let compPlan = org.compPlan;
  let compNote = org.compNote;
  let compUntil = org.compUntil;
  let founderPrice: string | null = null;
  let founderOfferUntil: Date | null = null;
  let founderCode: string | null = null;
  if (hasComp) {
    const raw = body.compPlan === null || body.compPlan === "" || body.compPlan === "none" ? null : body.compPlan;
    if (raw !== null && (!isPlanKey(raw) || raw === "free" || !PLANS_FOR[kind].includes(raw))) {
      return NextResponse.json({ error: `compPlan must be one of ${PLANS_FOR[kind].filter((p) => p !== "free").join(", ")} or null for a ${kind} account` }, { status: 400 });
    }
    compPlan = raw as string | null;
    compNote = compPlan && typeof body.compNote === "string" ? body.compNote.trim().slice(0, 200) || null : null;
    // Days from now, capped at five years. Null, 0 or absent means the comp has no end date.
    const days = typeof body.compDays === "number" && Number.isFinite(body.compDays) ? Math.floor(body.compDays) : 0;
    compUntil = compPlan && days > 0 ? new Date(Date.now() + Math.min(days, 1826) * 86_400_000) : null;
    founderPrice = compPlan && typeof body.founderPrice === "string" ? body.founderPrice.trim().slice(0, 120) || null : null;
    // Counted from when the comp ends, so the window is the same length whatever the comp length.
    // With no end date there is nothing to count from, so the offer has no deadline either.
    const claim = typeof body.claimDays === "number" && Number.isFinite(body.claimDays) ? Math.floor(body.claimDays) : 0;
    founderOfferUntil = founderPrice && compUntil && claim > 0 ? new Date(compUntil.getTime() + Math.min(claim, 365) * 86_400_000) : null;
    founderCode = founderPrice && typeof body.founderCode === "string" ? body.founderCode.trim().slice(0, 40).toUpperCase() || null : null;
  }

  if (hasKind) {
    const blocked = kindChangeBlocker({ ...org, compPlan }, kind);
    if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
  }

  const plan = storedPlan({ ...org, compPlan, compUntil });
  const updated = await prisma.organization.update({
    where: { id: org.id },
    data: {
      kind,
      plan,
      planUpdatedAt: new Date(),
      // A fresh grant resets both notices, so the account is told about this comp and its ending.
      ...(hasComp ? { compPlan, compNote, compUntil, founderPrice, founderOfferUntil, founderCode, compSetAt: new Date(), compSetBy: admin.email, compNoticeAt: null, compEndedNoticeAt: null } : {}),
    },
    select: { id: true, kind: true, plan: true, compPlan: true, compNote: true, compUntil: true, founderPrice: true, founderOfferUntil: true, founderCode: true },
  });
  console.info("[platform] account update", { org: org.id, kind: hasKind ? `${org.kind}→${kind}` : undefined, compPlan: hasComp ? compPlan : undefined, compUntil: hasComp ? compUntil : undefined, plan, by: admin.email });
  return NextResponse.json({ ok: true, org: updated });
}
