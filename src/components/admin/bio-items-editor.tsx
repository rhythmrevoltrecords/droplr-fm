"use client";
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BIO_ITEM_LIMIT, BIO_ITEM_NAME_MAX, type BioItemSection } from "@/lib/bio-items";
import { ASPECT_SQUARE, useImageUpload } from "./image-crop-dialog";

type Item = { id: string | null; name: string; url: string; imageUrl: string | null; visible: boolean };

/**
 * The editor for the merch and video blocks of a bio page. One component for both, because they
 * are the same list with different fields: a merch item is picture + name + shop link, a video is
 * a YouTube link and nothing else -- its title and still are looked up when it is saved.
 *
 * Up and down buttons rather than dragging, like the section order and for the same reason: these
 * pages get edited on a phone, where a drag handle fights the page's own scroll.
 */
export function BioItemsEditor({ section, saveUrl, initial }: { section: BioItemSection; saveUrl: string; initial: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const target = useRef<number | null>(null);
  const limit = BIO_ITEM_LIMIT[section];
  const merch = section === "merch";

  const patch = (i: number, p: Partial<Item>) => {
    setMsg(null);
    setItems((xs) => xs.map((x, n) => (n === i ? { ...x, ...p } : x)));
  };
  const move = (i: number, d: -1 | 1) =>
    setItems((xs) => {
      const to = i + d;
      if (to < 0 || to >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[to]] = [next[to], next[i]];
      return next;
    });

  const image = useImageUpload({
    endpoint: "/api/admin/upload-cover",
    purpose: "merch",
    aspects: [ASPECT_SQUARE],
    maxEdge: 800,
    title: "Crop picture",
    onUploaded: (img) => {
      if (target.current !== null) patch(target.current, { imageUrl: img.url });
    },
  });

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(saveUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((x) => (merch ? { id: x.id, name: x.name, url: x.url, imageUrl: x.imageUrl ?? "", visible: x.visible } : { id: x.id, url: x.url, visible: x.visible })),
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? "Couldn't save. Try again." });
    setItems(j.items);
    setMsg({ ok: true, text: "Saved" });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {image.ui}
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed border-input p-4 text-sm text-muted-foreground">
          {merch
            ? "Nothing here yet, so this block doesn't appear on your page."
            : "No videos yet, so this block doesn't appear on your page."}
        </p>
      )}
      <ul className="space-y-3">
        {items.map((x, i) => (
          <li key={x.id ?? `new-${i}`} className={`rounded-lg border border-input p-3 ${x.visible ? "" : "opacity-60"}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              {merch ? (
                <button
                  type="button"
                  onClick={() => { target.current = i; image.pick(); }}
                  disabled={image.busy}
                  className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-md border border-input bg-secondary/40 text-xs text-muted-foreground"
                  aria-label={x.imageUrl ? "Replace picture" : "Upload picture"}
                >
                  {x.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={x.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : image.uploading && target.current === i ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="flex flex-col items-center gap-1"><Upload className="h-4 w-4" /> Picture</span>
                  )}
                </button>
              ) : (
                x.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={x.imageUrl} alt="" className="aspect-video w-32 shrink-0 rounded-md object-cover" />
                )
              )}
              <div className="min-w-0 flex-1 space-y-2">
                {merch && (
                  <Input value={x.name} maxLength={BIO_ITEM_NAME_MAX} onChange={(e) => patch(i, { name: e.target.value })} placeholder="What it is, e.g. Tour tee" aria-label="Item name" />
                )}
                {!merch && x.id && <p className="truncate text-sm font-medium">{x.name}</p>}
                <Input
                  value={x.url}
                  onChange={(e) => patch(i, { url: e.target.value })}
                  placeholder={merch ? "Where it's sold, https://…" : "YouTube link, https://youtu.be/…"}
                  aria-label={merch ? "Shop address" : "YouTube link"}
                  inputMode="url"
                />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button type="button" variant="ghost" size="sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="sm" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="sm" aria-label={x.visible ? "Hide" : "Show"} onClick={() => patch(i, { visible: !x.visible })}>{x.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</Button>
                <Button type="button" variant="ghost" size="sm" aria-label="Remove" onClick={() => setItems((xs) => xs.filter((_, n) => n !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={items.length >= limit} onClick={() => setItems((xs) => [...xs, { id: null, name: "", url: "", imageUrl: null, visible: true }])}>
          <Plus className="h-4 w-4" /> {merch ? "Add an item" : "Add a video"}
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {merch ? "Save merch" : "Save videos"}</Button>
        <span className="text-xs text-muted-foreground">{items.length} of {limit}</span>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        {merch
          ? "No prices on purpose: a price typed here is wrong the day you change it in your shop. Taps on each item are counted in Who opened it."
          : "The video only loads when someone presses play, so it doesn't slow the page down. Plays are counted by YouTube; taps on Watch on YouTube are counted here."}
      </p>
    </div>
  );
}
