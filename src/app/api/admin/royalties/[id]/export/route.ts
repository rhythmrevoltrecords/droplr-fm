import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/lib/analytics";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bpsToPercent, microsToDecimal, money } from "@/lib/royalties";

export const dynamic = "force-dynamic";

/** GET ?party=<key>: one collaborator's statement as a CSV, or every collaborator's without it. Any plan. */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { id } = await props.params;
  const imp = await prisma.statementImport.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true, title: true, currency: true } });
  if (!imp) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const party = req.nextUrl.searchParams.get("party");
  const key = party && /^[ep][A-Za-z0-9]{1,40}$/.test(party) ? party : null;
  if (party && !key) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rows = await prisma.statementAllocation.findMany({ where: { importId: imp.id, ...(key ? { partyKey: key } : {}) }, orderBy: [{ partyName: "asc" }, { releaseTitle: "asc" }] });
  const upcs = new Map((await prisma.release.findMany({ where: { organizationId: user.organizationId, id: { in: [...new Set(rows.map((r) => r.releaseId).filter((x): x is string => !!x))] } }, select: { id: true, upc: true } })).map((r) => [r.id, r.upc]));
  const csv = toCsv(rows.map((r) => {
    return {
      statement: imp.title, party: r.partyName, role: r.partyRole, release: r.releaseTitle, upc: (r.releaseId && upcs.get(r.releaseId)) || "",
      share_percent: bpsToPercent(r.shareBps), sheet_version: r.sheetVersion, currency: imp.currency,
      amount: microsToDecimal(r.amountMicros), amount_display: money(r.amountMicros, imp.currency),
    };
  }));
  return new NextResponse(csv || "statement\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="statement-${imp.id}${key ? "-" + key.slice(0, 12) : ""}.csv"`,
      "Cache-Control": "no-store, private",
    },
  });
}
