import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatInTz } from "@/lib/time";

const tone: Record<string, "success" | "warning" | "danger" | "secondary" | "default"> = {
  completed: "success", emailed_and_clicked: "success", emailed: "default", pending: "warning", failed: "danger", unsubscribed: "secondary",
};

export function PresaveTable({ rows, timeZone, locationLabel }: { timeZone?: string | null; locationLabel?: string | null; rows: { id: string; email: string | null; emailConsent: boolean; platform: string; status: string; source: string | null; createdAt: Date; lastError: string | null }[] }) {
  return (
    <Table>
      <THead><TR><TH>Email</TH><TH>Platform</TH><TH>Source</TH><TH>Status</TH><TH>Created ({locationLabel || "Brisbane"})</TH></TR></THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.id}>
            <TD className="font-medium">{r.emailConsent ? r.email : <span className="text-muted-foreground">—</span>}</TD>
            <TD className="capitalize">{r.platform}</TD>
            <TD>{r.source ?? "direct"}</TD>
            <TD><Badge variant={tone[r.status] ?? "secondary"} title={r.lastError ?? undefined}>{r.status.replace(/_/g, " ")}</Badge></TD>
            <TD className="whitespace-nowrap text-muted-foreground">{formatInTz(r.createdAt, timeZone)}</TD>
          </TR>
        ))}
        {!rows.length && <TR><TD colSpan={5} className="py-10 text-center text-muted-foreground">No pre-saves yet.</TD></TR>}
      </TBody>
    </Table>
  );
}
