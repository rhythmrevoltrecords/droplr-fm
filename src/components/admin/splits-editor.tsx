"use client";
import { Plus, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { bpsToPercent, percentToBps, ROLE_LABEL, ROLES, SPLIT_LIMITS, TOTAL_BPS, type PartyState, type Role } from "@/lib/royalties";

export type SplitRow = { id?: string; name: string; email: string; role: Role; share: string; state?: PartyState; note?: string | null };

const STATE: Record<PartyState, { text: string; cls: string }> = {
  confirmed: { text: "Confirmed", cls: "text-emerald-400" },
  disputed: { text: "Says something's wrong", cls: "text-amber-400" },
  waiting: { text: "Waiting for them", cls: "text-muted-foreground" },
  "not-sent": { text: "Not sent yet", cls: "text-muted-foreground" },
};

const field = "h-10 w-full rounded-md border bg-background px-2.5 text-sm";

/** The last message per release, kept across the remount a refresh causes, so "Saved" doesn't vanish. */
const flash = new Map<string, { ok: boolean; text: string }>();

/**
 * The split sheet for one release. Saving any change to names or shares makes a new version and
 * everyone has to confirm again; that is the point of a confirmed sheet, so the editor says so.
 */
export function SplitsEditor({ releaseId, initial, version, exists, canCreate }: { releaseId: string; initial: SplitRow[]; version: number | null; exists: boolean; canCreate: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<SplitRow[]>(initial.length ? initial : [{ name: "", email: "", role: "artist", share: "100" }]);
  const [busy, setBusy] = useState<"save" | "send" | "delete" | null>(null);
  const [msg, setMsgState] = useState<{ ok: boolean; text: string } | null>(() => { const m = flash.get(releaseId) ?? null; flash.delete(releaseId); return m; });
  const setMsg = (m: { ok: boolean; text: string } | null) => { setMsgState(m); if (m) { flash.set(releaseId, m); setTimeout(() => flash.delete(releaseId), 3000); } else flash.delete(releaseId); };
  const [dirty, setDirty] = useState(false);
  const total = rows.reduce((n, r) => n + (percentToBps(r.share) ?? 0), 0);
  const set = (i: number, patch: Partial<SplitRow>) => { setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r))); setDirty(true); setMsg(null); };

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    return { ok: !!res?.ok, data: data as Record<string, unknown> };
  }

  async function save() {
    setBusy("save");
    const r = await call(`/api/admin/releases/${releaseId}/splits`, "PUT", { parties: rows.map((x) => ({ ...(x.id ? { id: x.id } : {}), name: x.name, email: x.email || null, role: x.role, share: x.share })) });
    setBusy(null);
    if (!r.ok) { setMsg({ ok: false, text: (r.data.error as string) ?? "Couldn't save that. Try again." }); return; }
    // Take the saved rows back, ids and all: without them the next save would replace every person,
    // and with them every link already sent.
    const saved = r.data.parties as { id: string; name: string; email: string; role: Role; share: string }[] | undefined;
    if (saved) setRows(saved.map((x) => ({ ...x, state: undefined })));
    setDirty(false);
    setMsg({ ok: true, text: "Saved. Send it so everyone can confirm this version." });
    router.refresh();
  }

  async function send() {
    setBusy("send");
    const r = await call(`/api/admin/releases/${releaseId}/splits/send`, "POST");
    setBusy(null);
    if (!r.ok) { setMsg({ ok: false, text: (r.data.error as string) ?? "Couldn't send it. Try again." }); return; }
    const { sent = 0, capped = 0, failed = [] } = r.data as { sent?: number; capped?: number; failed?: string[] };
    const parts = [sent ? `Sent to ${sent} ${sent === 1 ? "person" : "people"}.` : "Nobody new to send to."];
    if (capped) parts.push(`${capped} held back by the daily sending limit: send again tomorrow.`);
    if (failed.length) parts.push(`Couldn't email ${failed.join(", ")}.`);
    setMsg({ ok: !failed.length, text: parts.join(" ") });
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Delete this split sheet? Statements already worked out keep their figures.")) return;
    setBusy("delete");
    const r = await call(`/api/admin/releases/${releaseId}/splits`, "DELETE");
    setBusy(null);
    if (r.ok) { setRows([{ name: "", email: "", role: "artist", share: "100" }]); setDirty(false); router.refresh(); }
    else setMsg({ ok: false, text: "Couldn't delete it. Try again." });
  }

  if (!exists && !canCreate) {
    return <Card className="p-4 text-sm text-muted-foreground">Split sheets are on the Pro and Label plans.</Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Split sheet</CardTitle>
        <CardDescription>
          Who gets what share of this release&apos;s income from your distributor. Each person confirms their share from a link droplr emails them, and a statement is only split once everyone has confirmed. Change anything and everyone confirms again.
          {version !== null && ` This is version ${version}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.id ?? `new-${i}`} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1.2fr_1.4fr_1fr_6rem_auto] sm:items-end">
              <div className="space-y-1"><label htmlFor={`sp-n-${i}`} className="text-xs text-muted-foreground">Name</label><input id={`sp-n-${i}`} maxLength={SPLIT_LIMITS.name} value={r.name} onChange={(e) => set(i, { name: e.target.value })} className={field} /></div>
              <div className="space-y-1"><label htmlFor={`sp-e-${i}`} className="text-xs text-muted-foreground">Email{r.role === "label" ? " (optional)" : ""}</label><input id={`sp-e-${i}`} type="email" value={r.email} onChange={(e) => set(i, { email: e.target.value })} className={field} /></div>
              <div className="space-y-1">
                <label htmlFor={`sp-r-${i}`} className="text-xs text-muted-foreground">Role</label>
                <select id={`sp-r-${i}`} value={r.role} onChange={(e) => set(i, { role: e.target.value as Role })} className={field}>{ROLES.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}</select>
              </div>
              <div className="space-y-1"><label htmlFor={`sp-s-${i}`} className="text-xs text-muted-foreground">Share %</label><input id={`sp-s-${i}`} inputMode="decimal" value={r.share} onChange={(e) => set(i, { share: e.target.value })} className={`${field} tabular-nums`} /></div>
              <button type="button" onClick={() => { setRows((rs) => rs.filter((_, j) => j !== i)); setDirty(true); }} disabled={rows.length === 1} aria-label={`Remove ${r.name || "this person"}`} className="grid h-10 w-10 place-items-center rounded-md text-muted-foreground hover:text-red-400 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
              {r.state && !dirty && (
                <p className={`text-xs sm:col-span-5 ${STATE[r.state].cls}`}>{STATE[r.state].text}{r.state === "disputed" && r.note ? `: "${r.note}"` : ""}</p>
              )}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={rows.length >= SPLIT_LIMITS.parties} onClick={() => { setRows((rs) => [...rs, { name: "", email: "", role: "producer", share: "0" }]); setDirty(true); }}><Plus /> Add a person</Button>
          <span className={`text-sm tabular-nums ${total === TOTAL_BPS ? "text-emerald-400" : "text-amber-400"}`} aria-live="polite">Total {bpsToPercent(total)}%{total === TOTAL_BPS ? "" : " (has to be 100%)"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button type="button" onClick={save} disabled={busy !== null || !dirty || total !== TOTAL_BPS}>{busy === "save" ? "Saving…" : "Save"}</Button>
          {exists && <Button type="button" variant="outline" onClick={send} disabled={busy !== null || dirty}><Send /> {busy === "send" ? "Sending…" : "Send for confirmation"}</Button>}
          {exists && <button type="button" onClick={remove} disabled={busy !== null} className="ml-auto text-sm text-muted-foreground hover:text-red-400">Delete sheet</button>}
        </div>
        {dirty && exists && <p className="text-xs text-amber-400">Unsaved. Saving a change to names or shares sends the sheet back to unconfirmed for everyone.</p>}
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
      </CardContent>
    </Card>
  );
}
