import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { platformMeta } from "@/lib/platforms";
import { formatInTz } from "@/lib/time";

const tone: Record<string, "success" | "warning" | "danger" | "secondary" | "default"> = {
  completed: "success", emailed_and_clicked: "success", emailed: "default", pending: "warning", failed: "danger", unsubscribed: "secondary",
};

export function PresaveTable({ rows, timeZone, locationLabel }: { timeZone?: string | null; locationLabel?: string | null; rows: { id: string; email: string | null; emailConsent: boolean; platform: string; status: string; source: string | null; createdAt: Date; lastError: string | null; listenOn?: string | null; timezone?: string | null }[] }) {
  return (
    <>
    <div className="space-y-2 md:hidden">
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 break-all font-medium">{r.emailConsent ? r.email : <span className="text-muted-foreground">Email hidden</span>}</span>
            <Badge variant={tone[r.status] ?? "secondary"} title={r.lastError ?? undefined}>{r.status.replace(/_/g, " ")}</Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {[r.platform, r.listenOn ? `listens on ${platformMeta(r.listenOn).name}` : null, r.timezone, r.source ?? "direct", formatInTz(r.createdAt, timeZone)].filter(Boolean).join(" · ")}
          </div>
        </div>
      ))}
      {!rows.length && <p className="py-10 text-center text-sm text-muted-foreground">No pre-saves yet.</p>}
    </div>
    <div className="hidden md:block">
    <Table>
      <THead><TR><TH>Email</TH><TH>Platform</TH><TH>Listens on</TH><TH>Fan timezone</TH><TH>Source</TH><TH>Status</TH><TH>Created ({locationLabel || "Brisbane"})</TH></TR></THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.id}>
            <TD className="font-medium">{r.emailConsent ? r.email : <span className="text-muted-foreground">—</span>}</TD>
            <TD className="capitalize">{r.platform}</TD>
            <TD>{r.listenOn ? platformMeta(r.listenOn).name : <span className="text-muted-foreground">—</span>}</TD>
            <TD className="whitespace-nowrap text-muted-foreground">{r.timezone ?? "—"}</TD>
            <TD>{r.source ?? "direct"}</TD>
            <TD><Badge variant={tone[r.status] ?? "secondary"} title={r.lastError ?? undefined}>{r.status.replace(/_/g, " ")}</Badge></TD>
            <TD className="whitespace-nowrap text-muted-foreground">{formatInTz(r.createdAt, timeZone)}</TD>
          </TR>
        ))}
        {!rows.length && <TR><TD colSpan={7} className="py-10 text-center text-muted-foreground">No pre-saves yet.</TD></TR>}
      </TBody>
    </Table>
    </div>
    </>
  );
}
