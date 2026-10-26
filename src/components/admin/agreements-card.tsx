import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KIND_LABEL, STATUS_LABEL, standing, type AgreementKind, type AgreementStatus } from "@/lib/agreements";

type Row = { id: string; title: string; kind: string; status: string; endsOn: Date | null; noticeDays: number | null };

/** Agreements on a roster row or a release. Server component: nothing here reaches the browser as props. */
export function AgreementsCard({ rows, today, addHref, canAdd, empty }: { rows: Row[]; today: string; addHref: string; canAdd: boolean; empty: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agreements</CardTitle>
        <CardDescription>{rows.length ? `${rows.length} on record. Only your team sees these.` : empty}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((a) => {
          const s = standing(a, today);
          return (
            <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Link href={`/admin/agreements/${a.id}`} className="font-medium hover:underline">{a.title}</Link>
              <Badge variant="secondary">{KIND_LABEL[a.kind as AgreementKind] ?? a.kind}</Badge>
              <Badge variant={a.status === "signed" ? "success" : "secondary"}>{STATUS_LABEL[a.status as AgreementStatus] ?? a.status}</Badge>
              {s && <Badge variant={s.tone === "warn" ? "warning" : "secondary"}>{s.text}</Badge>}
            </div>
          );
        })}
        {canAdd && <Link href={addHref} className="inline-block text-sm text-violet-400 underline">Add an agreement</Link>}
      </CardContent>
    </Card>
  );
}
