"use client";
/**
 * The clip renderer is the heaviest thing in the admin — canvas composition, an FFT and the
 * encoder glue. Everyone who opens a release lands on the Links tab, so it's loaded only when the
 * Clip tab actually is, rather than being carried by every other tab on the page.
 *
 * ssr: false because none of it can run on the server: it needs Web Audio, a real canvas and
 * WebCodecs, and there is nothing useful to render without them.
 */
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { ClipForgeProps } from "./clip-forge";

const ClipForge = dynamic(() => import("./clip-forge").then((m) => m.ClipForge), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading the clip renderer…
    </div>
  ),
});

export function ClipForgeLazy(props: ClipForgeProps) {
  return <ClipForge {...props} />;
}
