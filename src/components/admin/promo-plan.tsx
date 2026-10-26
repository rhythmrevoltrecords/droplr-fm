"use client";
import { Check, Clock, ExternalLink, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ASSIGNEE_LABEL, ASSIGNEES, dayWords, TASK_LIMITS, type Assignee } from "@/lib/release-tasks";

export type PromoItem = { key: string; day: number; title: string; body: string; href: string | null; external: boolean; date: string; overdue: boolean; today: boolean; done: boolean; assignee: Assignee | null };
export type TaskItem = { id: string; day: number; title: string; note: string | null; assignee: Assignee; done: boolean };
/**
 * Team planning state for this release. `can` false keeps everything already made working and
 * only stops new assignments and tasks. `artist` is the artist login's name, or null when the
 * release has none — then nobody gets the artist's reminders, and the plan says so.
 */
export type TeamPlanning = { label: boolean; can: boolean; artist: string | null; releaseDay: string; todayDay: string };

/** The release day plus `day` days, as "Tue 3 Mar". Pure date arithmetic in UTC on the zoned day, so no timezone can shift it. */
function dateFor(releaseDay: string, day: number) {
  const d = new Date(Date.parse(`${releaseDay}T12:00:00Z`) + day * 86_400_000);
  return { label: d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }), iso: d.toISOString().slice(0, 10) };
}

type Row = { kind: "step"; item: PromoItem } | { kind: "task"; task: TaskItem };

export function PromoPlan({ releaseId, items, tasks: initialTasks, team, automatic, bestTime }: { releaseId: string; items: PromoItem[]; tasks: TaskItem[]; team: TeamPlanning; automatic: string[]; bestTime: string | null }) {
  const [done, setDone] = useState(() => new Set(items.filter((i) => i.done).map((i) => i.key)));
  const [assign, setAssign] = useState(() => new Map(items.map((i) => [i.key, i.assignee])));
  const [tasks, setTasks] = useState(initialTasks);
  const [err, setErr] = useState<string | null>(null);
  const total = items.length + tasks.length;
  const doneCount = done.size + tasks.filter((t) => t.done).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const rows = useMemo<Row[]>(() => {
    const r: Row[] = [...items.map((item) => ({ kind: "step" as const, item })), ...tasks.map((task) => ({ kind: "task" as const, task }))];
    return r.sort((a, b) => (a.kind === "step" ? a.item.day : a.task.day) - (b.kind === "step" ? b.item.day : b.task.day));
  }, [items, tasks]);

  async function post(url: string, body: unknown, method = "POST") {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) { setErr((data as { error?: string }).error ?? "Couldn't save that. Try again."); return null; }
    setErr(null);
    return data as Record<string, unknown>;
  }

  async function toggle(key: string) {
    const next = !done.has(key);
    setDone((s) => { const c = new Set(s); if (next) c.add(key); else c.delete(key); return c; });
    if (!(await post(`/api/admin/releases/${releaseId}/promo`, { key, done: next }))) {
      setDone((s) => { const c = new Set(s); if (next) c.delete(key); else c.add(key); return c; });
    }
  }

  async function reassign(key: string, value: string) {
    const assignee = value === "" ? null : (value as Assignee);
    const before = assign.get(key) ?? null;
    setAssign((m) => new Map(m).set(key, assignee));
    if (!(await post(`/api/admin/releases/${releaseId}/promo`, { key, assignee }))) setAssign((m) => new Map(m).set(key, before));
  }

  async function patchTask(id: string, patch: Partial<TaskItem>) {
    const before = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    if (!(await post(`/api/admin/releases/${releaseId}/tasks/${id}`, patch, "PATCH"))) setTasks(before);
  }

  async function removeTask(id: string) {
    const before = tasks;
    setTasks((ts) => ts.filter((t) => t.id !== id));
    if (!(await post(`/api/admin/releases/${releaseId}/tasks/${id}`, undefined, "DELETE"))) setTasks(before);
  }

  const noArtist = (a: Assignee | null) => team.label && !team.artist && (a === "artist" || a === "both");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Promo plan</CardTitle>
          <CardDescription>
            Dated steps counted back from release day. Move the release date and the plan moves with it.
            {bestTime ? ` Your fans are most active around ${bestTime}: post just before then.` : " Once your links have some traffic, this shows the hour your fans are most active."}
            {team.label && " Give a step to the label or the artist and that person gets an email on the day as well as the app notification."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Promo plan progress">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm tabular-nums text-muted-foreground">{doneCount}/{total}</span>
          </div>
          {team.label && !team.can && (
            <p className="text-sm text-muted-foreground">
              Assigning steps and adding your own tasks is on the Pro and Label plans. <Link href="/admin/settings/billing" className="text-violet-400 underline">See plans</Link>. Anything already assigned keeps working.
            </p>
          )}
          {team.label && !team.artist && (
            <p className="text-sm text-muted-foreground">This release has no artist login, so anything given to the artist has nobody to remind. Invite them from the Roster.</p>
          )}
          {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
        </CardContent>
      </Card>

      <ol className="space-y-2">
        {rows.map((row) => {
          if (row.kind === "task") {
            const t = row.task;
            const d = dateFor(team.releaseDay, t.day);
            const overdue = d.iso < team.todayDay, today = d.iso === team.todayDay;
            return (
              <li key={`t-${t.id}`} className={`flex gap-3 rounded-xl border p-3 sm:p-4 ${today && !t.done ? "border-violet-500/60 bg-violet-500/[0.06]" : overdue && !t.done ? "border-amber-500/40" : ""}`}>
                <TickButton done={t.done} title={t.title} onClick={() => patchTask(t.id, { done: !t.done })} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className={`font-medium ${t.done ? "text-muted-foreground line-through" : ""}`}>{t.title}</span>
                    <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">Your task</span>
                    <span className={`inline-flex items-center gap-1 text-xs ${overdue && !t.done ? "text-amber-400" : "text-muted-foreground"}`}>
                      <Clock className="h-3 w-3" aria-hidden /> {d.label} · {dayWords(t.day)}{today ? " · today" : ""}
                    </span>
                  </div>
                  {t.note && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{t.note}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <AssignSelect id={`as-t-${t.id}`} value={t.assignee} allowNone={false} onChange={(v) => patchTask(t.id, { assignee: v as Assignee })} />
                    <button type="button" onClick={() => removeTask(t.id)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400" aria-label={`Delete task: ${t.title}`}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
                    </button>
                  </div>
                  {noArtist(t.assignee) && <p className="mt-1 text-xs text-amber-400">No artist login on this release: the artist won&apos;t be reminded.</p>}
                </div>
              </li>
            );
          }
          const i = row.item;
          const isDone = done.has(i.key);
          const a = assign.get(i.key) ?? null;
          return (
            <li key={i.key} className={`flex gap-3 rounded-xl border p-3 sm:p-4 ${i.today && !isDone ? "border-violet-500/60 bg-violet-500/[0.06]" : i.overdue && !isDone ? "border-amber-500/40" : ""}`}>
              <TickButton done={isDone} title={i.title} onClick={() => toggle(i.key)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className={`font-medium ${isDone ? "text-muted-foreground line-through" : ""}`}>{i.title}</span>
                  <span className={`inline-flex items-center gap-1 text-xs ${i.overdue && !isDone ? "text-amber-400" : "text-muted-foreground"}`}>
                    <Clock className="h-3 w-3" aria-hidden /> {i.date} · {dayWords(i.day)}{i.today ? " · today" : ""}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{i.body}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {i.href && (
                    i.external
                      ? <a href={i.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-violet-400 underline">Open <ExternalLink className="h-3 w-3" /></a>
                      : <Link href={i.href} className="inline-block text-sm text-violet-400 underline">Open in droplr</Link>
                  )}
                  {team.label && (team.can || a) && <AssignSelect id={`as-${i.key}`} value={a} allowNone onChange={(v) => reassign(i.key, v)} lockedToNone={!team.can} />}
                </div>
                {noArtist(a) && <p className="mt-1 text-xs text-amber-400">No artist login on this release: the artist won&apos;t be reminded.</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {team.label && team.can && <AddTask releaseId={releaseId} releaseDay={team.releaseDay} count={tasks.length} onAdded={(t) => setTasks((ts) => [...ts, t])} />}

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

function TickButton({ done, title, onClick }: { done: boolean; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={done}
      aria-label={`${done ? "Mark not done" : "Mark done"}: ${title}`}
      className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border transition ${done ? "border-emerald-500 bg-emerald-500 text-black" : "hover:border-foreground/50"}`}
    >
      {done && <Check className="h-4 w-4" />}
    </button>
  );
}

/**
 * Who a step or task belongs to. `lockedToNone`: on a plan without team planning the only change
 * allowed is back to unassigned, so the other options are shown but disabled.
 */
function AssignSelect({ id, value, allowNone, onChange, lockedToNone = false }: { id: string; value: Assignee | null; allowNone: boolean; onChange: (v: string) => void; lockedToNone?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <label htmlFor={id}>For</label>
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="h-7 rounded-md border bg-background px-1.5 text-xs text-foreground">
        {allowNone && <option value="">Not assigned</option>}
        {ASSIGNEES.map((a) => <option key={a} value={a} disabled={lockedToNone && a !== value}>{ASSIGNEE_LABEL[a]}</option>)}
      </select>
    </span>
  );
}

function AddTask({ releaseId, releaseDay, count, onAdded }: { releaseId: string; releaseDay: string; count: number; onAdded: (t: TaskItem) => void }) {
  const [title, setTitle] = useState("");
  const [n, setN] = useState("7");
  const [side, setSide] = useState<"before" | "on" | "after">("before");
  const [assignee, setAssignee] = useState<Assignee>("label");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const full = count >= TASK_LIMITS.perRelease;
  const num = Math.abs(parseInt(n, 10) || 0);
  const day = side === "on" ? 0 : side === "before" ? -num : num;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/admin/releases/${releaseId}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, day, assignee, note: note || null }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) { setErr((data as { error?: string }).error ?? "Couldn't add that. Try again."); return; }
    const t = (data as { task: { id: string; title: string; note: string | null; day: number; assignee: Assignee } }).task;
    onAdded({ ...t, done: false });
    setTitle(""); setNote(""); setErr(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add your own task</CardTitle>
        <CardDescription>Anything the plan doesn&apos;t cover: masters to the distributor, artwork sign-off, a radio date. It moves with the release date like every other step.</CardDescription>
      </CardHeader>
      <CardContent>
        {full ? <p className="text-sm text-muted-foreground">This release has {TASK_LIMITS.perRelease} tasks, the most it can hold.</p> : (
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <label htmlFor="task-title" className="text-sm font-medium">Task</label>
              <input id="task-title" required maxLength={TASK_LIMITS.title} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Send the master to the distributor" className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">When</legend>
              <div className="flex gap-2">
                {side !== "on" && <input aria-label="Days" type="number" min={1} max={TASK_LIMITS.maxDay} value={n} onChange={(e) => setN(e.target.value)} className="h-10 w-20 rounded-md border bg-background px-2 text-sm tabular-nums" />}
                <select aria-label="Before or after release day" value={side} onChange={(e) => setSide(e.target.value as typeof side)} className="h-10 rounded-md border bg-background px-2 text-sm">
                  <option value="before">days before</option>
                  <option value="on">on release day</option>
                  <option value="after">days after</option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground">{dateFor(releaseDay, day).label}</p>
            </fieldset>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="task-note" className="text-sm font-medium">Note <span className="font-normal text-muted-foreground">(optional)</span></label>
              <textarea id="task-note" maxLength={TASK_LIMITS.note} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <span className="inline-flex items-center gap-1.5 text-sm">
                <label htmlFor="task-assignee">For</label>
                <select id="task-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value as Assignee)} className="h-10 rounded-md border bg-background px-2 text-sm">
                  {ASSIGNEES.map((a) => <option key={a} value={a}>{ASSIGNEE_LABEL[a]}</option>)}
                </select>
              </span>
              <Button type="submit" disabled={busy || !title.trim()}><Plus /> Add task</Button>
              {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
