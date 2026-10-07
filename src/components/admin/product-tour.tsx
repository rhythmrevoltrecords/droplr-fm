"use client";
import { ArrowRight, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TourStep } from "@/lib/tour";

type Box = { top: number; left: number; width: number; height: number };

/**
 * First-login walkthrough: dims the page, rings one thing at a time, Next through it.
 * Skippable from every step, and nothing is blocked once it's closed.
 */
export function ProductTour({ steps }: { steps: TourStep[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(true);
  const [box, setBox] = useState<Box | null>(null);
  /** Index of the step that has arrived — its target was found, or we gave up looking. */
  const [settledFor, setSettledFor] = useState(-1);
  const step = steps[i];

  /** Returns whether the target was found, so the caller can keep retrying after a navigation. */
  const place = useCallback(() => {
    if (!step?.target) {
      setBox(null);
      return true;
    }
    // Desktop and mobile nav both carry hooks: point at whichever one is actually on screen.
    const el = [...document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"], [data-tour="${step.target}-m"]`)].find((e) => e.getBoundingClientRect().width > 0);
    if (!el) {
      setBox(null);
      return false;
    }
    el.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
    const r = el.getBoundingClientRect();
    const pad = 8;
    setBox({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
    return true;
  }, [step]);

  // A step names the page it lives on. Move there first, or the ring has nothing to point at —
  // which is why steps for other pages used to show an unanchored card floating mid-screen.
  //
  // Pushed at most once per step. Some of these destinations redirect again on arrival
  // (/admin/artists sends an artist account to its own profile), so comparing the pathname to the
  // step's href on every render asked for the same navigation forever.
  const pushed = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !step?.href) return;
    if (pushed.current === step.href) return;
    pushed.current = step.href;
    if (pathname !== step.href) router.push(step.href);
  }, [open, step, pathname, router]);

  useLayoutEffect(() => {
    if (!open) return;
    // The target mounts some time after a navigation, so keep looking for a couple of seconds.
    let tries = 0;
    const attempt = () => {
      if (place() || tries++ > 20) {
        clearInterval(id);
        setSettledFor(i);
      }
    };
    const id = setInterval(attempt, 100);
    attempt();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place, pathname, i]);

  // Nothing is drawn while a step is still arriving: settledFor is compared to the current step
  // rather than reset by a separate effect, because the reset would have raced the layout effect
  // that sets it. The card used to paint immediately and the page navigated underneath it —
  // sometimes twice, when the destination redirected again — which read as the screen and the URL
  // flickering behind a dialog.

  const finish = useCallback(async () => {
    setOpen(false);
    await fetch("/api/tour", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ done: true }) }).catch(() => {});
    router.refresh();
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [finish, steps.length]);

  if (!open || !step || settledFor !== i) return null;
  const last = i === steps.length - 1;
  // Card under the ring when there's room below, otherwise above it.
  const below = !box || box.top + box.height < window.innerHeight * 0.6;
  const cardStyle: React.CSSProperties = box
    ? below
      ? { top: Math.min(box.top + box.height + 12, window.innerHeight - 220) }
      : { bottom: Math.min(window.innerHeight - box.top + 12, window.innerHeight - 220) }
    : { top: "50%", transform: "translateY(-50%)" };

  return (
    <div className="no-print fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Walkthrough">
      {/* The click-catcher must not paint over the thing being pointed at. It used to be a solid
          bg-black/70 with a blur across the whole viewport, and the ring sat on top of it — so the
          highlighted element was dimmed and blurred exactly like everything else, and a step whose
          target never mounted left a near-black screen with a card floating on it. The dimming is
          now the ring's own 9999px shadow, which is what leaves a hole where the target is. */}
      <button
        aria-label="Skip the walkthrough"
        tabIndex={-1}
        className={cn("absolute inset-0 cursor-default transition-colors", box ? "bg-transparent" : "bg-black/60")}
        onClick={() => void finish()}
      />
      {box && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-violet-400 transition-all duration-200"
          style={{ ...box, boxShadow: "0 0 0 9999px rgba(0,0,0,0.62), 0 0 40px -6px rgba(139,92,246,0.9)" }}
        />
      )}
      <div className="tour-card absolute inset-x-3 mx-auto max-w-sm rounded-2xl border border-white/10 bg-[#15121f] p-5 shadow-[0_24px_60px_-12px_rgba(0,0,0,.85)] sm:inset-x-6" style={cardStyle}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-muted-foreground">Step {i + 1} of {steps.length}</p>
          <button onClick={() => void finish()} className="text-muted-foreground hover:text-foreground" aria-label="Skip"><X className="h-4 w-4" /></button>
        </div>
        <h2 className="mt-2 font-semibold text-foreground">{step.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          {i > 0 && <Button variant="ghost" size="sm" onClick={() => setI(i - 1)}>Back</Button>}
          {last && step.cta ? (
            <Button size="sm" className="ml-auto" onClick={async () => { await finish(); router.push(step.cta!.href); }}>{step.cta.label} <ArrowRight /></Button>
          ) : last ? (
            <Button size="sm" className="ml-auto" onClick={() => void finish()}>Done</Button>
          ) : (
            <Button size="sm" className="ml-auto" onClick={() => setI(i + 1)}>Next</Button>
          )}
          {!last && <button onClick={() => void finish()} className="text-xs text-muted-foreground underline hover:text-foreground">Skip</button>}
        </div>
      </div>
    </div>
  );
}
