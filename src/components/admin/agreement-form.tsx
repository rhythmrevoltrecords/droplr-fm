"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { AGREEMENT_KINDS, AGREEMENT_LIMITS, AGREEMENT_STATUSES, DEFAULT_NOTICE_DAYS, KIND_LABEL, STATUS_LABEL, type AgreementFormValue, type AgreementKind, type AgreementStatus } from "@/lib/agreements";


type Opt = { id: string; label: string; artistId?: string | null };

const field = "h-10 w-full rounded-md border bg-background px-3 text-sm";

/** Create (no id) or edit (id) one agreement. Artists and releases are the account's own, chosen from lists. */
export function AgreementForm({ id, initial, artists, releases }: { id?: string; initial: AgreementFormValue; artists: Opt[]; releases: Opt[] }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof AgreementFormValue>(k: K, val: AgreementFormValue[K]) => { setV((s) => ({ ...s, [k]: val })); setSaved(false); };

  // The artist's releases first, then the rest; the search narrows both.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = releases.filter((r) => !needle || r.label.toLowerCase().includes(needle));
    return [...list.filter((r) => v.artistId && r.artistId === v.artistId), ...list.filter((r) => !v.artistId || r.artistId !== v.artistId)].slice(0, 100);
  }, [releases, q, v.artistId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = {
      title: v.title, kind: v.kind, status: v.status, artistId: v.artistId || null, counterparty: v.counterparty || null,
      signedOn: v.signedOn || null, startsOn: v.startsOn || null, endsOn: v.endsOn || null,
      noticeDays: v.noticeDays === "" ? null : Number(v.noticeDays), documentUrl: v.documentUrl || null, termsNote: v.termsNote || null, notes: v.notes || null, releaseIds: v.releaseIds,
    };
    const res = await fetch(id ? `/api/admin/agreements/${id}` : "/api/admin/agreements", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) { setErr((data as { error?: string }).error ?? "Couldn't save that. Try again."); return; }
    setErr(null);
    if (!id) router.push(`/admin/agreements/${(data as { id: string }).id}?created=1`);
    else { setSaved(true); router.refresh(); }
  }

  async function remove() {
    if (!id || !window.confirm("Delete this agreement record? The document itself, wherever it's stored, isn't touched.")) return;
    const res = await fetch(`/api/admin/agreements/${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) router.push("/admin/agreements");
    else setErr("Couldn't delete it. Try again.");
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="ag-title" className="text-sm font-medium">Name</label>
          <input id="ag-title" required maxLength={AGREEMENT_LIMITS.title} value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Single deal: Midnight Run" className={field} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="ag-kind" className="text-sm font-medium">Kind</label>
          <select id="ag-kind" value={v.kind} onChange={(e) => set("kind", e.target.value as AgreementKind)} className={field}>
            {AGREEMENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="ag-status" className="text-sm font-medium">Where it&apos;s up to</label>
          <select id="ag-status" value={v.status} onChange={(e) => set("status", e.target.value as AgreementStatus)} className={field}>
            {AGREEMENT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="ag-artist" className="text-sm font-medium">Artist on your roster</label>
          <select id="ag-artist" value={v.artistId} onChange={(e) => set("artistId", e.target.value)} className={field}>
            <option value="">None</option>
            {artists.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="ag-party" className="text-sm font-medium">Other party <span className="font-normal text-muted-foreground">(if not on the roster)</span></label>
          <input id="ag-party" maxLength={AGREEMENT_LIMITS.counterparty} value={v.counterparty} onChange={(e) => set("counterparty", e.target.value)} placeholder="A remixer, a distributor, a sync house" className={field} />
        </div>
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-4">
        <legend className="mb-2 text-sm font-medium">Dates</legend>
        {([["signedOn", "Signed"], ["startsOn", "Starts"], ["endsOn", "Ends"]] as const).map(([k, label]) => (
          <div key={k} className="space-y-1.5">
            <label htmlFor={`ag-${k}`} className="text-xs text-muted-foreground">{label}</label>
            <input id={`ag-${k}`} type="date" value={v[k]} onChange={(e) => set(k, e.target.value)} className={field} />
          </div>
        ))}
        <div className="space-y-1.5">
          <label htmlFor="ag-notice" className="text-xs text-muted-foreground">Notice period (days)</label>
          <input id="ag-notice" type="number" min={0} max={AGREEMENT_LIMITS.maxNoticeDays} value={v.noticeDays} onChange={(e) => set("noticeDays", e.target.value)} placeholder={String(DEFAULT_NOTICE_DAYS)} className={field} />
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-4">With an end date on a signed agreement, droplr reminds the label team on the day notice is due: the end date less the notice period, or {DEFAULT_NOTICE_DAYS} days if you leave it blank.</p>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="ag-url" className="text-sm font-medium">Link to the signed document</label>
        <input id="ag-url" type="url" inputMode="url" maxLength={AGREEMENT_LIMITS.url} value={v.documentUrl} onChange={(e) => set("documentUrl", e.target.value)} placeholder="https://drive.google.com/…" className={field} />
        <p className="text-xs text-muted-foreground">droplr keeps the link, never the file, and never opens it. Keep the document somewhere only your team can read. If the link stops working, droplr can&apos;t get the document back.</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="ag-terms" className="text-sm font-medium">The money, in one line <span className="font-normal text-muted-foreground">(optional)</span></label>
        <input id="ag-terms" maxLength={AGREEMENT_LIMITS.termsNote} value={v.termsNote} onChange={(e) => set("termsNote", e.target.value)} placeholder="50/50 net receipts after recoupment" className={field} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="ag-notes" className="text-sm font-medium">Notes <span className="font-normal text-muted-foreground">(only your team sees these)</span></label>
        <textarea id="ag-notes" maxLength={AGREEMENT_LIMITS.notes} rows={3} value={v.notes} onChange={(e) => set("notes", e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Releases it covers <span className="font-normal text-muted-foreground">({v.releaseIds.length})</span></legend>
        {releases.length > 8 && <input aria-label="Search releases" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search releases" className={field} />}
        {!releases.length ? <p className="text-sm text-muted-foreground">No releases on the account yet.</p> : (
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
            {shown.map((r) => {
              const on = v.releaseIds.includes(r.id);
              return (
                <li key={r.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-white/5">
                    <input type="checkbox" checked={on} onChange={() => set("releaseIds", on ? v.releaseIds.filter((x) => x !== r.id) : [...v.releaseIds, r.id])} />
                    {r.label}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || !v.title.trim()}>{id ? "Save" : "Add agreement"}</Button>
        {saved && <span role="status" className="text-sm text-emerald-400">Saved</span>}
        {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
        {id && <button type="button" onClick={remove} className="ml-auto text-sm text-muted-foreground hover:text-red-400">Delete record</button>}
      </div>
    </form>
  );
}
