"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Bring the gate up to date when the fan comes back.
 *
 * The step links open in a new tab, so the gate page is still sitting there in the original tab
 * showing the HTML it rendered before the fan went and followed anyone. They come back, the step
 * still says "Open ↗", the Download button is still grey, and the only way through is to reload
 * by hand — which most people won't do. They'll read it as a broken gate and leave.
 *
 * So whenever this tab is looked at again (or is restored from the back/forward cache), ask the
 * server for fresh HTML. router.refresh() re-runs the page's server component and swaps in the
 * new markup in place, keeping scroll position and anything typed into the email field.
 *
 * The wait matters: /api/gate/visit records the step in after(), which runs once the redirect has
 * already been sent. Refreshing the instant the tab regains focus can beat that write and render
 * the step as still pending, so we give it a moment first.
 */
export function GateRefresh({ pending }: { pending: boolean }) {
  const router = useRouter();
  const last = useRef(0);

  useEffect(() => {
    // Every required step is done — there is nothing left to come back for.
    if (!pending) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      const now = Date.now();
      // pageshow and visibilitychange can both fire for one return; one refresh is enough.
      if (now - last.current < 2000) return;
      last.current = now;
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 700);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refresh();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [pending, router]);

  return null;
}
