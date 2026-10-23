"use client";
import { CalendarPlus, Check, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dateNotes, dayString, parseDay, planFor, planIcs, planText, suggestedReleaseDay, TAB_LABELS, type PlanKind } from "@/lib/release-plan";

/** Today as the visitor's own calendar day, not UTC's. */
const localToday = () => {
  const n = new Date();
  return parseDay(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`)!;
};

const fmt = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * The tool itself. Renders on the server with no date, so the whole plan is in the HTML with
 * relative labels ("4 weeks before") for search engines and for anyone without JavaScript. The
 * date only appears once the browser knows what "today" is, which is also why the default date is
 * set in an effect: picking it during render would differ between server and browser.
 */
export function ReleasePlanTool({ site }: { site: string }) {
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<PlanKind>("artist");
  const [title, setTitle] = useState("");
  const [today, setToday] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = localToday();
    setToday(t);
    setDate(dayString(suggestedReleaseDay(t)));
  }, []);

  const releaseDay = parseDay(date);
  const items = useMemo(() => planFor(parseDay(date) ?? new Date(0), kind, today ?? new Date(0)), [date, kind, today]);
  const dated = !!releaseDay && !!today;
  const notes = dated ? dateNotes(releaseDay!, today!) : [];

  function download() {
    const ics = planIcs(items, { releaseTitle: title, stamp: new Date(), site, id: crypto.randomUUID() });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title.trim() || "release").replace(/[^\w-]+/g, "-").toLowerCase()}-plan.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(planText(items, title));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:grid-cols-3">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Release day</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Release name <span className="font-normal text-muted-foreground">(optional)</span></span>
          <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="For the calendar" />
        </label>
        <fieldset className="space-y-1.5 text-sm">
          <legend className="mb-1.5 font-medium">I&apos;m</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["artist", "label"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`h-10 rounded-md border text-sm transition ${kind === k ? "border-primary ring-2 ring-primary/40" : "border-input hover:border-primary/50"}`}
              >
                {k === "artist" ? "The artist" : "A label"}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {/* Always mounted: a live region that appears with its content is often not announced. */}
      <div role="status" aria-live="polite">
        {notes.length > 0 && (
          <ul className="space-y-1 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
            {notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
      </div>
      {date && !releaseDay && <p className="text-sm text-red-400" role="alert">That isn&apos;t a date. Pick one from the calendar.</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={download} disabled={!dated}><CalendarPlus className="h-4 w-4" /> Add to my calendar</Button>
        <Button type="button" variant="outline" onClick={copy} disabled={!dated}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy as text"}</Button>
      </div>

      <ol className="space-y-3">
        {items.map((it) => (
          <li key={it.key} className={`rounded-xl border p-4 ${it.day === 0 ? "border-primary/50 bg-primary/5" : "border-white/10"} ${dated && it.status === "missed" ? "opacity-50" : dated && it.past ? "opacity-80" : ""}`}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {dated ? `${fmt.format(parseDay(it.date)!)} · ${it.relative}` : it.relative}
              {dated && it.status === "late" && <span className="ml-2 rounded bg-amber-400/15 px-1.5 py-0.5 normal-case tracking-normal text-amber-200">late, do it now</span>}
              {dated && it.status === "missed" && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 normal-case tracking-normal text-muted-foreground">missed</span>}
            </p>
            <h3 className="mt-1 font-semibold">{it.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{it.body}</p>
            {(it.tab || it.href?.startsWith("https://")) && (
              <p className="mt-2 text-xs text-muted-foreground">
                {it.tab ? <>On droplr: the {TAB_LABELS[it.tab]} tab</> : <a href={it.href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">{it.href!.replace(/^https:\/\//, "")}</a>}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
