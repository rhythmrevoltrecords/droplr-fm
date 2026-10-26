"use client";
import { useState } from "react";

/** Confirm, or say what's wrong. The page only shows; these buttons are the only thing that changes anything. */
export function SplitAnswer({ token, version, initial }: { token: string; version: number; initial: "confirmed" | "disputed" | null }) {
  const [state, setState] = useState(initial);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function answer(action: "confirm" | "dispute") {
    setBusy(true);
    const res = await fetch(`/api/split/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, version, note: action === "dispute" ? note : undefined }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) { setErr((data as { error?: string }).error ?? "That didn't go through. Try again."); return; }
    setErr(null); setOpen(false); setState(action === "confirm" ? "confirmed" : "disputed");
  }
  return (
    <div className="space-y-3">
      {state === "confirmed" && <p role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">You&apos;ve confirmed this split sheet. If it changes, you&apos;ll be asked again.</p>}
      {state === "disputed" && <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">You&apos;ve told the label something&apos;s wrong. They&apos;ll change the sheet and send it again.</p>}
      <div className="flex flex-wrap gap-2">
        {state !== "confirmed" && <button type="button" disabled={busy} onClick={() => answer("confirm")} className="h-11 rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">Confirm my share</button>}
        <button type="button" disabled={busy} onClick={() => setOpen((o) => !o)} className="h-11 rounded-xl border border-white/20 px-5 text-sm hover:bg-white/5">Something&apos;s wrong</button>
      </div>
      {open && (
        <div className="space-y-2">
          <label htmlFor="split-note" className="block text-sm">What should it say? <span className="text-white/60">(the label sees this)</span></label>
          <textarea id="split-note" maxLength={500} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm" />
          <button type="button" disabled={busy} onClick={() => answer("dispute")} className="h-10 rounded-xl border border-amber-500/50 px-4 text-sm text-amber-300 hover:bg-amber-500/10">Send to the label</button>
        </div>
      )}
      {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
    </div>
  );
}
