"use client";
import { ExternalLink, Play, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { guideEmbed, guideThumb, guideWatchUrl, type Guide } from "@/lib/guides";

/**
 * A "Watch the guide" card: a click-to-load facade, then a modal player.
 *
 * Nothing from YouTube loads until the button is pressed — the thumbnail comes from YouTube's image
 * CDN, which is a request for a JPEG and not the player. That matters beyond page weight: the
 * cookie policy's promise that the dashboard loads no pixels stays literally true for anyone who
 * never presses play, and the privacy note only has to describe what happens when they do.
 *
 * There is no Dialog primitive in this codebase and no Radix dialog dependency, so the overlay is
 * hand-rolled the same way `create-link-modal.tsx` and `image-crop-dialog.tsx` do it: Escape to
 * close, body scroll locked while open, focus moved in and then put back where it came from.
 */
export function GuideCard({
  guide,
  dismissed,
  className,
}: {
  guide: Guide;
  /** True once this login has closed it. Rendered as nothing, so the card never flashes in. */
  dismissed: boolean;
  className?: string;
}) {
  const [gone, setGone] = useState(dismissed);
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  /** Where focus was before the modal opened, so it can go back there on close. */
  const returnTo = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    returnTo.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      // Keep Tab inside the dialog. Without this, tabbing walks into the page behind the overlay,
      // which a screen reader will happily read out as if the modal weren't there.
      if (e.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  if (gone) return null;

  const watchLabel = guide.runtime ? `Watch (${guide.runtime})` : "Watch";

  function dismiss() {
    setGone(true);
    // Fire and forget: the card is already gone locally, and a failed write only means it comes
    // back on the next device. Nothing here is worth an error state in front of the artist.
    void fetch("/api/guides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: guide.key }),
    }).catch(() => {});
  }

  return (
    <>
      <Card className={`relative flex flex-col gap-3 border-violet-500/30 bg-violet-500/5 p-4 sm:flex-row sm:items-center ${className ?? ""}`}>
        <button
          type="button"
          onClick={dismiss}
          aria-label={`Hide the guide "${guide.title}"`}
          className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={(e) => {
            returnTo.current = e.currentTarget;
            setOpen(true);
          }}
          aria-label={`Play: ${guide.title}`}
          className="group relative w-full shrink-0 overflow-hidden rounded-lg border border-white/10 sm:w-44"
        >
          {/* 16:9 box so the card doesn't jump when the thumbnail arrives. */}
          <span className="block aspect-video w-full bg-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN thumbnail, no loader needed */}
            <img
              src={guideThumb(guide)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition group-hover:opacity-90"
            />
          </span>
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-black/60 ring-1 ring-white/30 backdrop-blur transition group-hover:bg-black/75">
              <Play className="h-4 w-4 translate-x-[1px] fill-white text-white" />
            </span>
          </span>
        </button>

        <div className="min-w-0 flex-1 pr-6">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-300">Watch the guide</div>
          <h3 className="mt-0.5 truncate text-sm font-semibold">{guide.title}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{guide.blurb}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={(e) => {
                returnTo.current = e.currentTarget;
                setOpen(true);
              }}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" /> {watchLabel}
            </Button>
            <a
              href={guideWatchUrl(guide)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Open on YouTube <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </Card>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          onMouseDown={(e) => {
            // mousedown, not click: a click that *starts* inside the dialog and ends on the backdrop
            // (a stray drag while scrubbing) would otherwise close the player mid-watch.
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={guide.title}
            className="w-full max-w-3xl"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="truncate text-sm font-semibold text-white">{guide.title}</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-md p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
              <iframe
                title={guide.title}
                src={guideEmbed(guide)}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                className="h-full w-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
