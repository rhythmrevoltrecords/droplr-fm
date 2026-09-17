import { NextResponse, type NextRequest } from "next/server";
import { storedPlan } from "@/lib/billing";
import { prisma } from "@/lib/db";
import { platformAdmin } from "@/lib/platform";
import { isPlanKey } from "@/lib/plans";

export const dynamic = "force-dynamic";

/** PATCH { compPlan: "pro" | "label" | "enterprise" | null, compNote?: string } — platform owner only. */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const admin = await platformAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { compPlan?: unknown; compNote?: unknown };
  const compPlan = body.compPlan === null || body.compPlan === "" || body.compPlan === "none" ? null : body.compPlan;
  if (compPlan !== null && (!isPlanKey(compPlan) || compPlan === "free")) return NextResponse.json({ error: "compPlan must be pro, label, enterprise or null" }, { status: 400 });
  const compNote = typeof body.compNote === "string" ? body.compNote.trim().slice(0, 200) || null : null;

  const org = await prisma.organization.findUnique({ where: { id: params.id }, select: { id: true, stripeSubscriptionId: true, stripePriceId: true } });
  if (!org) return NextResponse.json({ error: "Label not found" }, { status: 404 });

  const plan = storedPlan({ ...org, compPlan });
  const updated = await prisma.organization.update({
    where: { id: org.id },
    data: { compPlan, compNote: compPlan ? compNote : null, compSetAt: new Date(), compSetBy: admin.email, plan, planUpdatedAt: new Date() },
    select: { id: true, plan: true, compPlan: true, compNote: true },
  });
  console.info("[platform] comp plan", { org: org.id, compPlan, plan, by: admin.email });
  return NextResponse.json({ ok: true, org: updated });
}
