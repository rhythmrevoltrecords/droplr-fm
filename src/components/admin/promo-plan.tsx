"use client";
import { Check, Clock, ExternalLink, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type PromoItem = { key: string; day: number; title: string; body: string; href: string | null; external: boolean; date: string; overdue: boolean; today: boolean; done: boolean };

const when = (day: number) => (day === 0 ? "Release day" : day < 0 ? `${-day} day${day === -1 ? "" : "s"} before` : `${day} day${day === 1 ? "" : "s"} after`);

export function PromoPlan({ releaseId, items, automatic, bestTime }: { releaseId: string; items: PromoItem[]; automatic: string[]; bestTime: string | null }) {
  const [done, setDone] = useState(() => new Set(items.filter((i) => i.done).map((i) => i.key)));
  const [err, setErr] = useState<string | null>(null);
  const pct = Math.round((done.size / items.length) * 100);

  async function toggle(key: string) {
    const next = !done.has(key);
    setDone((s) => { const c = new Set(s); if (next) c.add(key); else c.delete(key); return c; });
    const res = await fetch(`/api/admin/releases/${releaseId}/promo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, done: next }) });
    if (!res.ok) {
      setErr("Couldn't save that. Try again.");
      setDone((s) => { const c = new Set(s); if (next) c.delete(key); else c.add(key); return c; });
    } else setErr(null);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Promo plan</CardTitle>
          <CardDescription>
            Dated steps counted back from release day. Move the release date and the plan moves with it.
            {bestTime ? ` Your fans are most active around ${bestTime}: post just before then.` : " Once your links have some traffic, this shows the hour your fans are most active."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Promo plan progress">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm tabular-nums text-muted-foreground">{done.size}/{items.length}</span>
          </div>
          {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
        </CardContent>
      </Card>

      <ol className="space-y-2">
        {items.map((i) => {
          const isDone = done.has(i.key);
          return (
            <li key={i.key} className={`flex gap-3 rounded-xl border p-3 sm:p-4 ${i.today && !isDone ? "border-violet-500/60 bg-violet-500/[0.06]" : i.overdue && !isDone ? "border-amber-500/40" : ""}`}>
              <button
                type="button"
                onClick={() => toggle(i.key)}
                aria-pressed={isDone}
                aria-label={`${isDone ? "Mark not done" : "Mark done"}: ${i.title}`}
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border transition ${isDone ? "border-emerald-500 bg-emerald-500 text-black" : "hover:border-foreground/50"}`}
              >
                {isDone && <Check className="h-4 w-4" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className={`font-medium ${isDone ? "text-muted-foreground line-through" : ""}`}>{i.title}</span>
                  <span className={`inline-flex items-center gap-1 text-xs ${i.overdue && !isDone ? "text-amber-400" : "text-muted-foreground"}`}>
                    <Clock className="h-3 w-3" aria-hidden /> {i.date} · {when(i.day)}{i.today ? " · today" : ""}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{i.body}</p>
                {i.href && (
                  i.external
                    ? <a href={i.href} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-sm text-violet-400 underline">Open <ExternalLink className="h-3 w-3" /></a>
                    : <Link href={i.href} className="mt-1.5 inline-block text-sm text-violet-400 underline">Open in droplr</Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-violet-400" /> droplr does these for you</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {automatic.map((a) => <li key={a} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><span>{a}</span></li>)}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
