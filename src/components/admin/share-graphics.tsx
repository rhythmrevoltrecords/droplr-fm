import { Download } from "lucide-react";
import { ShareButton } from "@/components/admin/share-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Item = { key: string; title: string; hint: string; query: string };

export function ShareGraphics({ releaseId, live, milestones, presaves }: { releaseId: string; live: boolean; milestones: number[]; presaves: number }) {
  const base = `/api/admin/releases/${releaseId}/share`;
  const items: Item[] = [
    ...(!live ? [{ key: "countdown", title: "Countdown", hint: "Days to go, updates each day you download it", query: "kind=countdown" }] : []),
    { key: "out", title: "Out now", hint: live ? "For today's posts" : "Download now, post on release day", query: "kind=out" },
    ...milestones.map((n) => ({ key: `m${n}`, title: `${n.toLocaleString("en-AU")} pre-saves`, hint: "Thank fans and show momentum", query: `kind=milestone&n=${n}` })),
  ];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Share graphics</CardTitle>
          <CardDescription>
            Instagram story (9:16) and post (4:5) images made from the artwork, with the link written on them. Add the link as a story sticker too. On a phone, Share posts it straight to a story.
            {milestones.length === 0 && ` Milestone graphics unlock at 25 pre-saves (${presaves} so far).`}
          </CardDescription>
        </CardHeader>
      </Card>
      {items.map((it) => (
        <Card key={it.key}>
          <CardHeader><CardTitle className="text-base">{it.title}</CardTitle><CardDescription>{it.hint}</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,220px)_minmax(0,260px)] sm:items-end">
            {(["story", "post"] as const).map((f) => (
              <figure key={f} className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${base}?${it.query}&format=${f}`} alt={`${it.title} ${f} preview`} loading="lazy" className={`w-full rounded-lg border bg-muted object-cover ${f === "story" ? "aspect-[9/16]" : "aspect-[4/5]"}`} />
                <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{f === "story" ? "Story · 1080×1920" : "Post · 1080×1350"}</span>
                  <span className="flex items-center gap-2">
                    {/* On a phone this posts straight to a story; on desktop it renders nothing. */}
                    <ShareButton url={`${base}?${it.query}&format=${f}`} filename={`${it.key}-${f}.png`} title={it.title} />
                    <Button asChild size="sm" variant="secondary"><a href={`${base}?${it.query}&format=${f}&download=1`}><Download /> PNG</a></Button>
                  </span>
                </figcaption>
              </figure>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
