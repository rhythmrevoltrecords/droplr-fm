"use client";
import { ExternalLink, Play } from "lucide-react";
import { useState } from "react";
import { postEmbed, postThumb, postWatchUrl, type Post } from "@/lib/blog";

/**
 * Click-to-load player, same bargain as the in-app guide cards: nothing from YouTube's player
 * loads until the button is pressed. The still is a JPEG from YouTube's image CDN, so the cookie
 * policy's description of what a visit loads stays true for anyone who only reads the article.
 *
 * Inline rather than the admin card's modal: on an article the video is part of the page, and a
 * dialog would be a worse place to watch it from.
 */
export function PostPlayer({ post }: { post: Post }) {
  const [playing, setPlaying] = useState(false);
  return (
    <figure className="not-prose overflow-hidden rounded-2xl border bg-black/40">
      <div className="relative aspect-video">
        {playing ? (
          <iframe
            src={postEmbed(post)}
            title={post.title}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 h-full w-full"
            aria-label={`Play: ${post.title}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a YouTube still, not an asset we host or optimise */}
            <img src={postThumb(post)} alt="" className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" loading="lazy" />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-white/95 shadow-lg transition-transform group-hover:scale-105">
                <Play className="ml-0.5 h-7 w-7 fill-black text-black" aria-hidden />
              </span>
            </span>
          </button>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground">
        <span>Watch instead — {post.runtime} · narrated with an AI voice</span>
        <a href={postWatchUrl(post)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
          Open on YouTube <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </figcaption>
    </figure>
  );
}
