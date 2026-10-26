"use client";
import { Check, Clock } from "lucide-react";
import { useState } from "react";

export type ArtistPlanRow = { key: string; title: string; body: string | null; date: string; overdue: boolean; done: boolean };

/** What the label gave this artist on one release. Ticking it here ticks it on the label's plan. */
export function ArtistPlanList({ releaseId, rows }: { releaseId: string; rows: ArtistPlanRow[] }) {
  const [done, setDone] = useState(() => new Set(rows.filter((r) => r.done).map((r) => r.key)));
  const [err, setErr] = useState<string | null>(null);
  async function toggle(key: string) {
    const next = !done.has(key);
    setDone((s) => { const c = new Set(s); if (next) c.add(key); else c.delete(key); return c; });
    const res = await fetch("/api/dashboard/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ releaseId, key, done: next }) }).catch(() => null);
    if (!res?.ok) {
      setErr("Couldn't save that. Try again.");
      setDone((s) => { const c = new Set(s); if (next) c.delete(key); else c.add(key); return c; });
    } else setErr(null);
  }
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">For you on this release</h3>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const isDone = done.has(r.key);
          return (
            <li key={r.key} className="flex gap-2.5">
              <button
                type="button"
                onClick={() => toggle(r.key)}
                aria-pressed={isDone}
                aria-label={`${isDone ? "Mark not done" : "Mark done"}: ${r.title}`}
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition ${isDone ? "border-emerald-500 bg-emerald-500 text-black" : "hover:border-foreground/50"}`}
              >
                {isDone && <Check className="h-3.5 w-3.5" />}
              </button>
              <div className="min-w-0 text-sm">
                <span className={isDone ? "text-muted-foreground line-through" : ""}>{r.title}</span>
                <span className={`ml-2 inline-flex items-center gap-1 text-xs ${r.overdue && !isDone ? "text-amber-400" : "text-muted-foreground"}`}><Clock className="h-3 w-3" aria-hidden /> {r.date}</span>
                {r.body && <p className="text-xs text-muted-foreground">{r.body}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
    </div>
  );
}
