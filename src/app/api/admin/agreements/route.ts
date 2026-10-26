import { hasBeta } from "@/lib/beta";
import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AGREEMENT_LIMITS, parseAgreement, type AgreementInput } from "@/lib/agreements";
import { agreementData, contractsAllowed, ownedRefs } from "@/lib/agreements-server";

export const dynamic = "force-dynamic";

/** POST: record a new agreement. Label team, label account, a plan with contracts. */
export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!hasBeta(user.organization, "agreements")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = contractsAllowed(user.organization);
  if (!gate.can) return NextResponse.json({ error: gate.why === "artist" ? "Agreements are for label accounts." : "Agreements are on the Pro and Label plans." }, { status: 402 });
  const parsed = parseAgreement(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const f = parsed.ok as AgreementInput;
  const bad = await ownedRefs(user.organizationId, f);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  if ((await prisma.agreement.count({ where: { organizationId: user.organizationId } })) >= AGREEMENT_LIMITS.perAccount) {
    return NextResponse.json({ error: `An account can hold ${AGREEMENT_LIMITS.perAccount} agreements.` }, { status: 400 });
  }
  const a = await prisma.agreement.create({
    data: { ...agreementData(f), title: f.title, organizationId: user.organizationId, releases: { create: (f.releaseIds ?? []).map((releaseId) => ({ releaseId })) } },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: a.id });
}
