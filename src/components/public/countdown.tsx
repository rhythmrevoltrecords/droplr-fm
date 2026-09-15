"use client";
import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export function Countdown({ target }: { target: string }) {
  const t = new Date(target).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= t) window.location.reload();
    }, 1000);
    return () => clearInterval(id);
  }, [t]);
  const p = parts(now == null ? 0 : t - now);
  const cells: [string, number][] = [["days", p.d], ["hrs", p.h], ["min", p.m], ["sec", p.s]];
  return (
    <div className="grid grid-cols-4 gap-2" aria-live="polite" suppressHydrationWarning>
      {cells.map(([label, v]) => (
        <div key={label} className="glass rounded-xl py-3 text-center">
          <div className="text-2xl font-semibold tabular-nums">{now == null ? "--" : String(v).padStart(2, "0")}</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/60">{label}</div>
        </div>
      ))}
    </div>
  );
}
