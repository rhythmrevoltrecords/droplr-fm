"use client";
import { AlertTriangle, Download, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { ShareButton } from "@/components/admin/share-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Spelled out rather than imported from lib/share-image: that module pulls in sharp, next/og and
// node:fs, none of which belong in a client bundle.
const DIMS = { story: { width: 1080, height: 1920 }, post: { width: 1080, height: 1350 } } as const;

type Item = { key: string; title: string; hint: string; query: string };
type State = "loading" | "ready" | "error";

/**
 * Each graphic is a server-side 1080x1920 rasterise, and this tab asks for up to eight of them.
 * Three things follow from that, and all three were missing:
 *
 *  - the URLs carry `v` (shareVersion) so they can be cached permanently instead of for five
 *    minutes. An edit changes the key, so nothing is ever stale;
 *  - `Re-render` bumps a nonce, which is the only honest way to force a fresh render past an
 *    immutable cache. Reloading the page can't do it, and neither could leaving the tab and
 *    coming back — that was the workaround, not the fix;
 *  - a render that is slow or fails now says so and offers a retry. Before, a failed <img> left
 *    an empty bordered box that looked identical to one still loading, forever.
 */
export function ShareGraphics({ releaseId, live, milestones, presaves, version }: { releaseId: string; live: boolean; milestones: number[]; presaves: number; version: string }) {
  const base = `/api/admin/releases/${releaseId}/share`;
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<Record<string, State>>({});

  const items: Item[] = [
    ...(!live ? [{ key: "countdown", title: "Countdown", hint: "Days to go, updates each day you download it", query: "kind=countdown" }] : []),
    { key: "out", title: "Out now", hint: live ? "For today's posts" : "Download now, post on release day", query: "kind=out" },
    ...milestones.map((n) => ({ key: `m${n}`, title: `${n.toLocaleString("en-AU")} pre-saves`, hint: "Thank fans and show momentum", query: `kind=milestone&n=${n}` })),
  ];

  // The nonce is part of the cache key, so bumping it re-requests every image on the tab.
  const src = useCallback(
    (query: string, format: string) => `${base}?${query}&format=${format}&v=${version}${nonce ? `&r=${nonce}` : ""}`,
    [base, version, nonce],
  );
  const rerender = () => { setState({}); setNonce((n) => n + 1); };
  const pending = items.length * 2 - Object.values(state).filter((s) => s !== "loading").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Share graphics</CardTitle>
            <CardDescription>
              Instagram story (9:16) and post (4:5) images made from the artwork, with the link written on them. Add the link as a story sticker too. On a phone, Share posts it straight to a story.
              {milestones.length === 0 && ` Milestone graphics unlock at 25 pre-saves (${presaves} so far).`}
            </CardDescription>
          </div>
          {/* Never disabled. Cards below the fold load lazily, so they don't report until they are
              scrolled into view — gating the button on "everything has reported" would leave it dead
              on arrival, which is the bug this button exists to fix. The spinner is information. */}
          <Button size="sm" variant="outline" onClick={rerender}>
            {pending > 0 ? <Loader2 className="animate-spin" /> : <RefreshCw />} Re-render
          </Button>
        </CardHeader>
      </Card>
      {items.map((it, cardIndex) => (
        <Card key={it.key}>
          <CardHeader><CardTitle className="text-base">{it.title}</CardTitle><CardDescription>{it.hint}</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,220px)_minmax(0,260px)] sm:items-end">
            {(["story", "post"] as const).map((f) => {
              const id = `${it.key}-${f}-${nonce}`;
              const st = state[id] ?? "loading";
              const url = src(it.query, f);
              return (
                <figure key={f} className="space-y-2">
                  <div className={`relative w-full overflow-hidden rounded-lg border bg-muted ${f === "story" ? "aspect-[9/16]" : "aspect-[4/5]"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={id}
                      src={url}
                      alt={`${it.title} ${f} preview`}
                      width={DIMS[f].width}
                      height={DIMS[f].height}
                      // The first card is what the artist came here for; lazy-loading it only delays
                      // the one image they are looking at. Cards further down stay lazy.
                      loading={cardIndex === 0 ? "eager" : "lazy"}
                      decoding="async"
                      onLoad={() => setState((s) => ({ ...s, [id]: "ready" }))}
                      onError={() => setState((s) => ({ ...s, [id]: "error" }))}
                      className={`h-full w-full object-cover transition-opacity ${st === "ready" ? "opacity-100" : "opacity-0"}`}
                    />
                    {st === "loading" && (
                      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
                    )}
                    {st === "error" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
                        <AlertTriangle className="size-5 text-amber-500" />
                        <span>That one didn&apos;t render.</span>
                        <Button size="sm" variant="secondary" onClick={rerender}>Try again</Button>
                      </div>
                    )}
                  </div>
                  <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{f === "story" ? "Story · 1080×1920" : "Post · 1080×1350"}</span>
                    <span className="flex items-center gap-2">
                      {/* On a phone this posts straight to a story; on desktop it renders nothing. */}
                      <ShareButton url={url} filename={`${it.key}-${f}.png`} title={it.title} />
                      <Button asChild size="sm" variant="secondary"><a href={`${url}&download=1`}><Download /> PNG</a></Button>
                    </span>
                  </figcaption>
                </figure>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
