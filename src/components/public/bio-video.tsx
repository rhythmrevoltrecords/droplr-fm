"use client";
import { useState } from "react";
import { youTubeEmbedUrl, youTubeId } from "@/lib/youtube-id";

/**
 * One video on a bio page: droplr's own copy of the still, and a play button.
 *
 * The player is not on the page until the fan presses play. Before that the only things loaded are
 * the picture (from droplr) and this component's own few lines. The embed address is built from an
 * id that has been validated twice -- once when it was saved, once here -- never from stored text.
 *
 * Imports lib/youtube-id only, which imports nothing. test:close fails the build if a "use client" file
 * reaches lib/db, and this one is rendered on every public bio page.
 */
export function BioVideo({ id, url, title, imageUrl, preview }: { id: string; url: string; title: string; imageUrl: string | null; preview: boolean }) {
  const [playing, setPlaying] = useState(false);
  const vid = youTubeId(url);
  if (!vid) return null;

  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="relative aspect-video w-full bg-black/60">
        {playing ? (
          <iframe
            src={youTubeEmbedUrl(vid)}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => !preview && setPlaying(true)}
            aria-label={`Play ${title}`}
            className="group absolute inset-0 grid place-items-center"
          >
            {imageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={imageUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
            )}
            <span className="relative grid h-14 w-14 place-items-center rounded-full bg-black/70 ring-1 ring-white/30 transition group-hover:scale-105">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="ml-0.5 h-6 w-6 fill-white"><path d="M8 5.5v13l11-6.5z" /></svg>
            </span>
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        {/* Through droplr's counted redirect, so "Watch on YouTube" shows up in the stats like any
            other button. A press of play inside the page is YouTube's to count, not droplr's. */}
        <a href={preview ? undefined : `/api/b/${id}`} className="shrink-0 text-[11px] font-semibold text-white/70 hover:text-white">
          Watch on YouTube
        </a>
      </div>
    </div>
  );
}
