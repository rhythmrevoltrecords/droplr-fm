"use client";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PlatformIcon } from "@/components/public/platform-icon";
import { BUTTON_TEXT_PRESETS, CUSTOM_BUTTON_PRESETS, guessPlatformFromUrl, MANUAL_PLATFORMS, PLATFORM_KEYS, platformMeta } from "@/lib/platforms";
import { cn } from "@/lib/utils";

export type EditorLink = { id?: string | null; platform: string; url: string; title: string | null; buttonText: string | null; icon: string | null; visible: boolean };
type L = EditorLink & { key: string };

const withKey = (l: EditorLink, i: number): L => ({ ...l, key: l.id ?? `${l.platform}-${i}-${Math.random().toString(36).slice(2)}` });

function Row({ link, onChange, onRemove, presetsId }: { link: L; onChange: (l: L) => void; onRemove: () => void; presetsId: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.key });
  const meta = platformMeta(link.platform);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-xl border bg-card p-2", isDragging && "z-10 ring-2 ring-primary", !link.visible && "border-dashed bg-card/40")}
    >
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <button type="button" className="cursor-grab touch-none p-1 text-muted-foreground" aria-label="Drag to reorder" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Icon: monogram override, blank = platform default */}
        <div className={cn("relative shrink-0", !link.visible && "opacity-40")}>
          <PlatformIcon platform={link.platform} icon={link.icon} />
          <input
            aria-label="Icon letter"
            title="Icon (1–2 characters). Leave blank for the default."
            value={link.icon ?? ""}
            maxLength={2}
            placeholder=""
            onChange={(e) => onChange({ ...link, icon: e.target.value || null })}
            className="absolute inset-0 h-9 w-9 cursor-text rounded-lg bg-transparent text-center text-transparent caret-white focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <Input
          aria-label="Title"
          value={link.title ?? ""}
          onChange={(e) => onChange({ ...link, title: e.target.value || null })}
          placeholder={link.platform === "custom" ? "Title, e.g. Merch & Vinyl" : meta.name}
          className={cn("h-8 min-w-0 flex-1 sm:w-52 sm:flex-none lg:w-48", !link.visible && "opacity-60")}
        />
        <Input
          aria-label="URL"
          value={link.url}
          onChange={(e) => onChange({ ...link, url: e.target.value })}
          placeholder="https://…"
          className={cn("h-8 min-w-0 flex-1 basis-full sm:basis-60", !link.visible && "opacity-60")}
        />
        <Input
          aria-label="Button text"
          list={presetsId}
          value={link.buttonText ?? ""}
          onChange={(e) => onChange({ ...link, buttonText: e.target.value || null })}
          placeholder={meta.action}
          maxLength={20}
          className={cn("h-8 w-28", !link.visible && "opacity-60")}
        />
        <Button
          type="button"
          size="sm"
          variant={link.visible ? "ghost" : "secondary"}
          onClick={() => onChange({ ...link, visible: !link.visible })}
          aria-pressed={!link.visible}
          title={link.visible ? "Visible to fans — click to hide" : "Hidden from fans — click to show"}
          className="w-24 justify-start"
        >
          {link.visible ? <Eye /> : <EyeOff />} {link.visible ? "Shown" : "Hidden"}
        </Button>
        <Button type="button" size="icon" variant="ghost" onClick={onRemove} aria-label="Remove"><Trash2 /></Button>
      </div>
    </div>
  );
}

/**
 * Shared drag-to-reorder link editor (release pages + bio links).
 * Per row: icon letter, title, URL, button text, show/hide, delete. Hidden rows stay here but not on the public page.
 */
export function LinkEditor({ saveUrl, reresolveUrl, initial }: { saveUrl: string; reresolveUrl?: string; initial: EditorLink[] }) {
  const router = useRouter();
  const presetsId = useId();
  const [links, setLinks] = useState<L[]>(initial.map(withKey));
  const [newPlatform, setNewPlatform] = useState("beatport");
  const [newUrl, setNewUrl] = useState("");
  const [busy, setBusy] = useState<"save" | "resolve" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    setLinks((ls) => arrayMove(ls, ls.findIndex((l) => l.key === e.active.id), ls.findIndex((l) => l.key === e.over!.id)));
  };

  async function save() {
    setBusy("save");
    setMsg(null);
    const res = await fetch(saveUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links: links.map(({ key: _k, ...l }) => l) }),
    });
    const j = await res.json();
    setBusy(null);
    if (!res.ok) return setMsg({ ok: false, text: j.error });
    // Adopt server ids so the next save updates rows instead of recreating them
    if (Array.isArray(j.links)) setLinks((j.links as EditorLink[]).map(withKey));
    setMsg({ ok: true, text: "Saved" });
    router.refresh();
  }

  async function reresolve() {
    setBusy("resolve");
    setMsg(null);
    const res = await fetch(reresolveUrl!, { method: "POST" });
    const j = await res.json();
    setBusy(null);
    setMsg(res.ok ? { ok: !!j.added, text: j.note } : { ok: false, text: j.error });
    if (j.added) window.location.reload();
  }

  const add = () => {
    if (!newUrl) return;
    const platform = newPlatform === "auto" ? guessPlatformFromUrl(newUrl) : newPlatform;
    setLinks((ls) => [...ls, withKey({ platform, url: newUrl.trim(), title: platform === "custom" ? "Link" : null, buttonText: null, icon: null, visible: true }, ls.length)]);
    setNewUrl("");
  };

  const addPreset = (p: (typeof CUSTOM_BUTTON_PRESETS)[number]) =>
    setLinks((ls) => [...ls, withKey({ platform: "custom", url: "", title: p.title, buttonText: p.buttonText, icon: null, visible: true }, ls.length)]);

  const hidden = links.filter((l) => !l.visible).length;

  return (
    <div className="space-y-4">
      <datalist id={presetsId}>{BUTTON_TEXT_PRESETS.map((b) => <option key={b} value={b} />)}</datalist>

      <div className="hidden gap-2 px-2 text-[11px] uppercase tracking-wide text-muted-foreground lg:flex">
        <span className="w-6" /><span className="w-9">Icon</span><span className="w-48">Title</span><span className="flex-1">URL</span><span className="w-28">Button</span><span className="w-24">Visibility</span><span className="w-9" />
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={links.map((l) => l.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {links.map((l, i) => (
              <Row key={l.key} link={l} presetsId={presetsId} onChange={(n) => setLinks((ls) => ls.map((x, j) => (j === i ? n : x)))} onRemove={() => setLinks((ls) => ls.filter((_, j) => j !== i))} />
            ))}
            {!links.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No links yet.</p>}
          </div>
        </SortableContext>
      </DndContext>

      <div className="space-y-2 rounded-xl border border-dashed p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)} className="sm:w-48">
            <optgroup label="Stores & DJ">
              {MANUAL_PLATFORMS.map((p) => <option key={p} value={p}>{platformMeta(p).name}{p === "custom" ? " (custom button)" : ""}</option>)}
            </optgroup>
            <optgroup label="Other">
              <option value="auto">Detect from URL</option>
              {PLATFORM_KEYS.filter((p) => !MANUAL_PLATFORMS.includes(p)).map((p) => <option key={p} value={p}>{platformMeta(p).name}</option>)}
            </optgroup>
          </Select>
          <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://www.beatport.com/release/…" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
          <Button type="button" variant="secondary" onClick={add}><Plus /> Add platform</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Quick custom buttons:</span>
          {CUSTOM_BUTTON_PRESETS.map((p) => (
            <button key={p.title} type="button" onClick={() => addPreset(p)} className="rounded-full border px-2.5 py-1 hover:border-violet-500/40 hover:text-foreground">
              + {p.title}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={!!busy}>{busy === "save" && <Loader2 className="animate-spin" />} Save links</Button>
        {reresolveUrl && (
          <Button variant="outline" onClick={reresolve} disabled={!!busy}>
            {busy === "resolve" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Find Apple Music &amp; Deezer
          </Button>
        )}
        {hidden > 0 && <span className="text-xs text-muted-foreground">{hidden} hidden from fans</span>}
        {msg && <span className={cn("text-sm", msg.ok ? "text-emerald-400" : "text-muted-foreground")}>{msg.text}</span>}
      </div>
    </div>
  );
}
