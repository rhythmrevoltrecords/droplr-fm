import { NextResponse } from "next/server";
import { toCsv } from "@/lib/analytics";
import { dayString, KIND_LABEL, STATUS_LABEL, type AgreementKind, type AgreementStatus } from "@/lib/agreements";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Every agreement record on the account as a CSV, on every plan. The label's own notes about its
 * own deals: no plan should stand between a label and that, least of all on the way out.
 */
export async function GET() {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const rows = await prisma.agreement.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "asc" },
    include: { artist: { select: { name: true } }, releases: { select: { release: { select: { title: true, artistName: true, upc: true } } } } },
    take: 5000,
  });
  const csv = toCsv(rows.map((a) => ({
    name: a.title,
    kind: KIND_LABEL[a.kind as AgreementKind] ?? a.kind,
    status: STATUS_LABEL[a.status as AgreementStatus] ?? a.status,
    artist: a.artist?.name ?? "",
    other_party: a.counterparty ?? "",
    signed: dayString(a.signedOn),
    starts: dayString(a.startsOn),
    ends: dayString(a.endsOn),
    notice_days: a.noticeDays ?? "",
    document_link: a.documentUrl ?? "",
    terms: a.termsNote ?? "",
    notes: a.notes ?? "",
    releases: a.releases.map((r) => `${r.release.title} (${r.release.artistName}${r.release.upc ? `, UPC ${r.release.upc}` : ""})`).join("; "),
  })));
  return new NextResponse(csv || "name\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${user.organization.slug}-agreements.csv"`,
      "Cache-Control": "no-store, private",
    },
  });
}
