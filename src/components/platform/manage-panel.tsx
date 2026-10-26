"use client";
import { useEffect, useRef } from "react";

/**
 * A row's Manage drawer. A plain <details>, so it works without JavaScript, plus the three things
 * native details doesn't do: opening one closes any other, and Escape or a click outside closes it.
 * The desktop panel floats over the rows below, so two open at once would cover each other.
 */
export function ManagePanel({ name, children }: { name: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onToggle = () => {
      if (!el.open) return;
      document.querySelectorAll<HTMLDetailsElement>("details[data-manage-panel][open]").forEach((d) => { if (d !== el) d.open = false; });
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && el.open) { el.open = false; el.querySelector("summary")?.focus(); } };
    const onDown = (e: PointerEvent) => { if (el.open && !el.contains(e.target as Node)) el.open = false; };
    el.addEventListener("toggle", onToggle);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      el.removeEventListener("toggle", onToggle);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, []);
  return (
    <details ref={ref} data-manage-panel className="group relative col-span-2 md:col-span-1 md:text-right">
      <summary aria-label={`Manage ${name}`} className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full border border-white/[0.1] px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground group-open:border-violet-400/40 group-open:text-foreground [&::-webkit-details-marker]:hidden">
        Manage <span aria-hidden className="transition group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-3 space-y-4 rounded-xl border border-white/[0.08] bg-[hsl(240_8%_7%)] p-4 text-left shadow-2xl md:absolute md:right-0 md:top-full md:z-20 md:mt-2 md:w-[24rem]">
        {children}
      </div>
    </details>
  );
}
