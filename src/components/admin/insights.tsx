"use client";
import { Lightbulb } from "lucide-react";
import { useMemo, useState } from "react";
import type { Grid, Insight } from "@/lib/analytics";
import { platformMeta } from "@/lib/platforms";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
const fmt = (n: number) => n.toLocaleString("en-AU");

/** Quantile-ish buckets on the non-zero cells, so one viral hour doesn't flatten the rest. */
function bucketer(grid: Grid) {
  const values = grid.flat().filter((v) => v > 0).sort((a, b) => a - b);
  if (!values.length) return () => 0;
  const q = (p: number) => values[Math.min(values.length - 1, Math.floor(p * values.length))];
  const cuts = [q(0.2), q(0.45), q(0.7), q(0.9)];
  return (v: number) => (v <= 0 ? 0 : v <= cuts[0] ? 1 : v <= cuts[1] ? 2 : v <= cuts[2] ? 3 : v <= cuts[3] ? 4 : 5);
}
const FILL = ["var(--viz-empty)", "var(--viz-seq-1)", "var(--viz-seq-2)", "var(--viz-seq-3)", "var(--viz-seq-4)", "var(--viz-seq-5)"];

export function ActivityHeatmap({ views, presaves }: { views: Grid; presaves: Grid }) {
  const [metric, setMetric] = useState<"views" | "presaves">("views");
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const grid = metric === "views" ? views : presaves;
  const bucket = useMemo(() => bucketer(grid), [grid]);
  const total = grid.flat().reduce((a, b) => a + b, 0);
  const busiest = useMemo(
    () => grid.flatMap((row, d) => row.map((n, h) => ({ d, h, n }))).filter((c) => c.n > 0).sort((a, b) => b.n - a.n).slice(0, 8),
    [grid],
  );
  const label = metric === "views" ? "page views" : "pre-saves";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Metric" className="inline-flex rounded-lg border p-0.5 text-sm">
          {(["views", "presaves"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={metric === m} onClick={() => setMetric(m)} className={`rounded-md px-3 py-1 ${metric === m ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {m === "views" ? "Page views" : "Pre-saves"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-hidden>
          Less {FILL.map((f, i) => <span key={i} className="h-3 w-3 rounded-[3px]" style={{ background: f }} />)} More
        </div>
      </div>

      {total === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No {label} in this range yet.</p>
      ) : (
        <div className="relative max-w-3xl">
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: "2.25rem repeat(24, minmax(0, 1fr))" }} onPointerLeave={() => setHover(null)}>
            {ORDER.map((d) => (
              <div key={d} className="contents">
                <div className="flex items-center text-[11px] text-muted-foreground">{DAYS[d]}</div>
                {grid[d].map((n, h) => (
                  <div
                    key={h}
                    role="img"
                    aria-label={`${DAYS[d]} ${hourLabel(h)}: ${fmt(n)} ${label}`}
                    tabIndex={0}
                    onPointerEnter={() => setHover({ d, h })}
                    onFocus={() => setHover({ d, h })}
                    onBlur={() => setHover(null)}
                    className={`aspect-square rounded-[3px] outline-none transition ${hover?.d === d && hover?.h === h ? "ring-2 ring-foreground/70" : ""}`}
                    style={{ background: FILL[bucket(n)] }}
                  />
                ))}
              </div>
            ))}
            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="pt-1 text-center text-[10px] text-muted-foreground">{h % 6 === 0 ? hourLabel(h) : ""}</div>
            ))}
          </div>
          <p className="mt-2 min-h-5 text-sm tabular-nums" aria-live="polite">
            {hover ? <><span className="font-medium">{DAYS[hover.d]} {hourLabel(hover.h)}–{hourLabel((hover.h + 1) % 24)}</span> <span className="text-muted-foreground">· {fmt(grid[hover.d][hover.h])} {label}</span></> : <span className="text-muted-foreground">Hover a square. Times are each fan&apos;s own local time.</span>}
          </p>
          <details className="mt-1 text-sm">
            <summary className="cursor-pointer text-muted-foreground">Busiest hours as a table</summary>
            <table className="mt-2 w-full max-w-sm text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-normal">When (fan time)</th><th className="py-1 text-right font-normal">{metric === "views" ? "Views" : "Pre-saves"}</th></tr></thead>
              <tbody>{busiest.map((c) => <tr key={`${c.d}-${c.h}`} className="border-t"><td className="py-1">{DAYS[c.d]} {hourLabel(c.h)}</td><td className="py-1 text-right tabular-nums">{fmt(c.n)}</td></tr>)}</tbody>
            </table>
          </details>
        </div>
      )}
    </div>
  );
}

const DEVICE_SLOT: Record<string, string> = { mobile: "var(--viz-series-1)", desktop: "var(--viz-series-2)", tablet: "var(--viz-series-3)" };
const deviceName = (d: string) => (d === "unknown" ? "Unknown" : d.charAt(0).toUpperCase() + d.slice(1));

/** Part-to-whole: one stacked bar with a 2px surface gap between segments, labelled legend below. */
export function DeviceShare({ rows }: { rows: { device: string; views: number }[] }) {
  const total = rows.reduce((a, b) => a + b.views, 0);
  const [hover, setHover] = useState<string | null>(null);
  if (!total) return <p className="py-6 text-center text-sm text-muted-foreground">No views yet.</p>;
  const ordered = ["mobile", "desktop", "tablet", "unknown"].map((d) => rows.find((r) => r.device === d)).filter((r): r is { device: string; views: number } => !!r && r.views > 0);
  return (
    <div className="space-y-3">
      <div className="flex h-7 w-full gap-[2px]" onPointerLeave={() => setHover(null)}>
        {ordered.map((r, i) => (
          <div
            key={r.device}
            role="img"
            aria-label={`${deviceName(r.device)}: ${Math.round((r.views / total) * 100)}%`}
            onPointerEnter={() => setHover(r.device)}
            className={`h-full transition ${i === 0 ? "rounded-l-[4px]" : ""} ${i === ordered.length - 1 ? "rounded-r-[4px]" : ""} ${hover && hover !== r.device ? "opacity-60" : ""}`}
            style={{ width: `${(r.views / total) * 100}%`, minWidth: 3, background: DEVICE_SLOT[r.device] ?? "var(--viz-other)" }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {ordered.map((r) => (
          <li key={r.device} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: DEVICE_SLOT[r.device] ?? "var(--viz-other)" }} aria-hidden />
            <span>{deviceName(r.device)}</span>
            <span className="tabular-nums text-muted-foreground">{Math.round((r.views / total) * 100)}% · {fmt(r.views)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ranked magnitude: one hue for every bar, value labels outside the bar end, tail folded into "Other". */
export function RankBars({ rows, empty, max = 8 }: { rows: { label: string; value: number }[]; empty: string; max?: number }) {
  const total = rows.reduce((a, b) => a + b.value, 0);
  if (!total) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const head = rows.slice(0, max);
  const tail = rows.slice(max).reduce((a, b) => a + b.value, 0);
  const shown = tail ? [...head, { label: "Other", value: tail }] : head;
  const top = Math.max(...shown.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {shown.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-3 text-sm" title={`${r.label}: ${fmt(r.value)}`}>
          <span className="truncate">{r.label}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-3.5 rounded-r-[4px]" style={{ width: `${Math.max(2, (r.value / top) * 85)}%`, background: r.label === "Other" ? "var(--viz-other)" : "var(--viz-bar)" }} />
            <span className="shrink-0 tabular-nums text-muted-foreground">{fmt(r.value)} <span className="text-xs">({Math.round((r.value / total) * 100)}%)</span></span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function StoreChoiceBars({ rows }: { rows: { platform: string; presaves: number }[] }) {
  return <RankBars rows={rows.map((r) => ({ label: platformMeta(r.platform).name, value: r.presaves }))} empty="No fan has picked a store yet." />;
}

export function InsightList({ items, enough }: { items: Insight[]; enough: boolean }) {
  if (!items.length)
    return <p className="text-sm text-muted-foreground">{enough ? "No strong patterns yet. Keep sharing and check back." : "Patterns show up once a release has at least 30 page views in this range."}</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((i) => (
        <li key={i.title} className="flex gap-3 rounded-xl border p-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
          <div className="min-w-0"><p className="font-medium">{i.title}</p><p className="mt-0.5 text-sm text-muted-foreground">{i.body}</p></div>
        </li>
      ))}
    </ul>
  );
}
