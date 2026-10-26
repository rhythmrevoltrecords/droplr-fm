import { hasBeta } from "@/lib/beta";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { dayString } from "@/lib/agreements";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bpsToPercent, money } from "@/lib/royalties";

export const dynamic = "force-dynamic";
export const metadata = { title: "Statement" };

/** One collaborator's statement, written to be printed or saved as a PDF and sent to them. */
export default async function PartyStatementPage(props: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await props.params;
  const user = await requireUser("label");
  // Not switched on for this account: the feature doesn't exist here.
  if (!hasBeta(user.organization, "royalties")) notFound();
  const imp = await prisma.statementImport.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true, title: true, currency: true, periodStart: true, periodEnd: true, calculatedAt: true } });
  if (!imp) notFound();
  const rows = await prisma.statementAllocation.findMany({ where: { importId: imp.id, partyKey: key }, orderBy: { amountMicros: "desc" } });
  if (!rows.length) notFound();
  const ids = rows.map((r) => r.releaseId).filter((x): x is string => !!x);
  const releases = new Map((await prisma.release.findMany({ where: { organizationId: user.organizationId, id: { in: ids } }, select: { id: true, upc: true } })).map((r) => [r.id, r]));
  const lines = new Map((await prisma.statementLine.findMany({ where: { importId: imp.id, id: { in: rows.map((r) => r.lineId) } } })).map((l) => [l.id, l.amountMicros]));
  const total = rows.reduce((n, r) => n + r.amountMicros, 0n);
  const period = imp.periodStart || imp.periodEnd ? `${dayString(imp.periodStart) || "?"} to ${dayString(imp.periodEnd) || "?"}` : imp.title;

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:max-w-none">
      <p className="text-sm text-muted-foreground print:hidden"><Link href="/admin/royalties" className="hover:underline">Royalties</Link> / <Link href={`/admin/royalties/${imp.id}`} className="hover:underline">{imp.title}</Link> / {rows[0].partyName}</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Statement from {user.organization.name}</p>
          <h1 className="text-2xl font-semibold">{rows[0].partyName}</h1>
          <p className="text-sm text-muted-foreground">{period} · {imp.currency}</p>
        </div>
        <Button asChild size="sm" variant="outline" className="print:hidden"><a href={`/api/admin/royalties/${imp.id}/export?party=${encodeURIComponent(key)}`}>CSV</a></Button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 font-medium">Release</th><th className="py-2 font-medium">Role</th><th className="py-2 text-right font-medium">Release total</th><th className="py-2 text-right font-medium">Share</th><th className="py-2 text-right font-medium">Yours</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const rel = r.releaseId ? releases.get(r.releaseId) : null;
            return (
              <tr key={r.id} className="border-b">
                <td className="py-2">{r.releaseTitle}{rel?.upc ? <span className="text-muted-foreground"> · UPC {rel.upc}</span> : null}</td>
                <td className="py-2 text-muted-foreground">{r.partyRole}</td>
                <td className="py-2 text-right tabular-nums">{money(lines.get(r.lineId) ?? 0n, imp.currency)}</td>
                <td className="py-2 text-right tabular-nums">{bpsToPercent(r.shareBps)}%</td>
                <td className="py-2 text-right tabular-nums">{money(r.amountMicros, imp.currency)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr><td colSpan={4} className="py-3 text-right font-semibold">Total</td><td className="py-3 text-right font-semibold tabular-nums">{money(total, imp.currency)}</td></tr></tfoot>
      </table>
      <p className="text-xs text-muted-foreground">
        Each line is shown to the cent; the total is the exact sum, so the lines may differ from it by a cent or two. Worked out by droplr.fm from the distributor statement {user.organization.name} imported and the split sheet each collaborator confirmed. It is each share of what the distributor reported, before any recoupment, advances or costs your agreement may deduct, which droplr doesn&apos;t know about. droplr never holds or pays money: {user.organization.name} pays you directly.
      </p>
    </div>
  );
}
