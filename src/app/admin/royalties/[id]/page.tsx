import { hasBeta } from "@/lib/beta";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatementActions } from "@/components/admin/statement-actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { dayString } from "@/lib/agreements";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { money, partyState } from "@/lib/royalties";
import { formatInTz } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Statement" };

/**
 * One imported statement: who is owed what, which releases it covered and whether each was split,
 * and what matched nothing. A release whose sheet isn't confirmed shows as not split, with why —
 * droplr says it can't tell rather than inventing a split.
 */
export default async function StatementPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireUser("label");
  // Not switched on for this account: the feature doesn't exist here.
  if (!hasBeta(user.organization, "royalties")) notFound();
  const imp = await prisma.statementImport.findFirst({ where: { id, organizationId: user.organizationId }, include: { lines: { include: { release: { select: { id: true, title: true, artistName: true, splitSheet: { include: { parties: true } } } } }, orderBy: { amountMicros: "desc" } } } });
  if (!imp) notFound();
  // One line per collaborator: the same address on several releases is one person, whatever name each sheet gave them.
  const sums = await prisma.statementAllocation.groupBy({ by: ["partyKey"], where: { importId: imp.id }, _sum: { amountMicros: true } });
  const names = new Map((await prisma.statementAllocation.findMany({ where: { importId: imp.id }, select: { partyKey: true, partyName: true }, orderBy: { sheetVersion: "asc" } })).map((a) => [a.partyKey, a.partyName]));
  const allocs = sums.map((s) => ({ partyKey: s.partyKey, partyName: names.get(s.partyKey) ?? "", total: s._sum.amountMicros ?? 0n }));
  const splitLines = new Map((await prisma.statementAllocation.findMany({ where: { importId: imp.id }, select: { lineId: true, sheetVersion: true }, distinct: ["lineId"] })).map((a) => [a.lineId, a.sheetVersion]));
  const unmatched = (Array.isArray(imp.unmatched) ? imp.unmatched : []) as { upc: string; isrc: string; micros: string; rows: number }[];
  const tz = user.organization.timezone;
  const period = imp.periodStart || imp.periodEnd ? `${dayString(imp.periodStart) || "?"} to ${dayString(imp.periodEnd) || "?"}` : null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground"><Link href="/admin/royalties" className="hover:underline">Royalties</Link> / {imp.title}</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{imp.title}</h1>
          <p className="text-sm text-muted-foreground">{period ? `${period} · ` : ""}{imp.currency} · {imp.rowsMatched.toLocaleString()} of {imp.rowsTotal.toLocaleString()} rows matched a release{imp.calculatedAt ? ` · worked out ${formatInTz(imp.calculatedAt, tz)}` : ""}</p>
        </div>
        <StatementActions id={imp.id} />
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Who is owed what</h2>
        {!allocs.length ? <Card className="p-4 text-sm text-muted-foreground">Nothing has been split yet: no release on this statement has a split sheet everyone has confirmed. When one does, press Work it out again.</Card> : (
          <ul className="divide-y rounded-xl border">
            {allocs.sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : a.partyName.localeCompare(b.partyName))).map((a) => (
              <li key={a.partyKey} className="flex items-baseline justify-between gap-3 p-3 text-sm">
                <Link href={`/admin/royalties/${imp.id}/party/${a.partyKey}`} className="font-medium hover:underline">{a.partyName}</Link>
                <span className="tabular-nums">{money(a.total, imp.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Releases on this statement</h2>
        <ul className="divide-y rounded-xl border">
          {imp.lines.map((l) => {
            const s = l.release?.splitSheet ?? null;
            const confirmed = s ? s.parties.filter((pt) => partyState(pt, s.version) === "confirmed").length : 0;
            const doneAt = splitLines.get(l.id);
            const current = !!s && confirmed === s.parties.length && doneAt === s.version;
            return (
              <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3 text-sm">
                <span>{l.release ? <Link href={`/admin/releases/${l.release.id}?tab=splits`} className="font-medium hover:underline">{l.release.title}</Link> : <span className="font-medium">{l.releaseTitle}</span>} <span className="text-muted-foreground">{l.release ? l.release.artistName : "release since deleted"}</span></span>
                <span className="flex items-center gap-2">
                  {doneAt !== undefined
                    ? current ? <Badge variant="success">Split</Badge> : <Badge variant="warning">Split by version {doneAt} of the sheet{s ? `, now version ${s.version}` : ""}</Badge>
                    : !s ? <Badge variant="secondary">No split sheet</Badge> : <Badge variant="warning">Not split: {confirmed} of {s.parties.length} confirmed</Badge>}
                  <span className="tabular-nums">{money(l.amountMicros, imp.currency)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {unmatched.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Matched no release</h2>
          <p className="text-sm text-muted-foreground">{money(imp.unmatchedMicros, imp.currency)} in total. Add the UPC or ISRC to the release in its Settings, then import the statement again. The biggest are listed.</p>
          <ul className="divide-y rounded-xl border text-sm">
            {unmatched.slice(0, 25).map((u, i) => (
              <li key={i} className="flex justify-between gap-3 p-2.5"><span className="font-mono text-xs">{[u.upc && `UPC ${u.upc}`, u.isrc && `ISRC ${u.isrc}`].filter(Boolean).join(" · ")}</span><span className="tabular-nums">{money(u.micros, imp.currency)}</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
