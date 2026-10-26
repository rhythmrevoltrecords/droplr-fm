import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("en-AU");

/** "2026-10" → "Oct 2026", for tooltips. UTC, like the month keys. */
const monthName = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" });
};

/**
 * Thirteen months as thin bars, one series, so no legend: the tile's title names it. Each bar is a
 * hover target the full height of the chart (not just the bar), with the month and count as its
 * tooltip. Zero months draw a 1px baseline tick, so "nothing" reads as nothing rather than as a gap.
 */
export function SparkBars({ months, label }: { months: { month: string; value: number }[]; label: string }) {
  const W = 156;
  const H = 36;
  const gap = 2;
  const n = Math.max(months.length, 1);
  const bw = (W - gap * (n - 1)) / n;
  const max = Math.max(1, ...months.map((m) => m.value));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${label}, last ${n} months`} className="block overflow-visible">
      {months.map((m, i) => {
        const x = i * (bw + gap);
        const h = m.value ? Math.max(2, (m.value / max) * (H - 2)) : 1;
        const last = i === months.length - 1;
        return (
          <g key={m.month}>
            <title>{`${monthName(m.month)}: ${fmt(m.value)}`}</title>
            <rect x={x} y={0} width={bw} height={H} fill="transparent" />
            <rect
              x={x}
              y={H - h}
              width={bw}
              height={h}
              rx={m.value ? Math.min(1.5, bw / 2) : 0}
              className={m.value ? (last ? "fill-violet-400" : "fill-violet-500/70") : "fill-white/15"}
            />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * One headline figure. The big number is customers only; `all` (including our own accounts) sits
 * under it in small type, named, and only when it differs. `thisMonth` is the current month so far.
 */
export function StatTile({
  label,
  value,
  all,
  note,
  months,
  size = "md",
}: {
  label: string;
  value: number;
  all?: number;
  note?: string;
  months?: { month: string; value: number }[];
  size?: "lg" | "md";
}) {
  const thisMonth = months?.[months.length - 1]?.value ?? 0;
  return (
    <div className={cn("relative flex flex-col justify-between gap-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-5", size === "lg" && "min-h-[9.5rem]")}>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        <div className={cn("mt-2 font-semibold tabular-nums tracking-tight text-foreground", size === "lg" ? "text-4xl" : "text-3xl")}>{fmt(value)}</div>
        {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
        {all !== undefined && all !== value && <div className="mt-1 text-xs text-muted-foreground/80">{fmt(all)} including our own accounts</div>}
      </div>
      {months && (
        <div className="flex items-end justify-between gap-3">
          <SparkBars months={months} label={label} />
          <div className="shrink-0 text-right text-xs text-muted-foreground">
            <div className="tabular-nums text-foreground">{thisMonth ? `+${fmt(thisMonth)}` : "0"}</div>
            this month
          </div>
        </div>
      )}
    </div>
  );
}
