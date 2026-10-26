import { hasBeta } from "@/lib/beta";
import { notFound } from "next/navigation";
import Link from "next/link";
import { StatementImport } from "@/components/admin/statement-import";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { money } from "@/lib/royalties";
import { royaltiesAllowed } from "@/lib/royalties-server";
import { formatInTz } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Royalties" };

export default async function RoyaltiesPage() {
  const user = await requireUser("label");
  // Not switched on for this account: the feature doesn't exist here.
  if (!hasBeta(user.organization, "royalties")) notFound();
  const gate = royaltiesAllowed(user.organization);
  const [imports, sheets] = await Promise.all([
    prisma.statementImport.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, currency: true, matchedMicros: true, unmatchedMicros: true, createdAt: true, _count: { select: { lines: true } } }, take: 200 }),
    prisma.splitSheet.count({ where: { organizationId: user.organizationId } }),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Royalties</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Import a statement from your distributor and droplr works out what each collaborator is owed, from each release&apos;s confirmed split sheet. Set up splits on a release&apos;s Splits tab. droplr tracks this and never holds, moves or pays money: you pay your collaborators yourself.
        </p>
      </div>
      {gate.can ? (
        <Card>
          <CardHeader>
            <CardTitle>Import a statement</CardTitle>
            <CardDescription>The file is read in your browser. droplr receives a total per release and never the statement&apos;s lines.{sheets === 0 ? " No release has a split sheet yet, so nothing will be split until one does." : ""}</CardDescription>
          </CardHeader>
          <CardContent><StatementImport defaultCurrency="AUD" /></CardContent>
        </Card>
      ) : (
        <Card className="p-4 text-sm text-muted-foreground">
          {gate.why === "artist" ? "Royalties are for label accounts." : <>Split sheets and statements are on the Pro and Label plans. <Link href="/admin/settings/billing" className="text-violet-400 underline">See plans</Link>.</>}
          {imports.length > 0 && " Statements you already imported stay here: you can read, export and delete them."}
        </Card>
      )}
      <section className="space-y-2">
        <h2 className="font-semibold">Statements</h2>
        {!imports.length ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">None imported yet.</p> : (
          <ul className="space-y-2">
            {imports.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border p-4">
                <div>
                  <Link href={`/admin/royalties/${s.id}`} className="font-medium hover:underline">{s.title}</Link>
                  <p className="text-xs text-muted-foreground">Imported {formatInTz(s.createdAt, user.organization.timezone, { dateStyle: "medium" })} · {s._count.lines} release{s._count.lines === 1 ? "" : "s"} matched</p>
                </div>
                <div className="text-right text-sm tabular-nums">
                  {money(s.matchedMicros, s.currency)}
                  {s.unmatchedMicros !== 0n && <span className="block text-xs text-amber-400">{money(s.unmatchedMicros, s.currency)} didn&apos;t match a release</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
