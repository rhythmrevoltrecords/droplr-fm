"use client";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PlatformIcon } from "@/components/public/platform-icon";
import { guessPlatformFromUrl, MANUAL_PLATFORMS, PLATFORM_KEYS, platformMeta } from "@/lib/platforms";

type L = { key: string; platform: string; url: string; label: string | null; isActive: boolean };

function Row({ link, onChange, onRemove }: { link: L; onChange: (l: L) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.key });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 sm:flex-nowrap ${isDragging ? "z-10 ring-2 ring-primary" : ""}`}>
      <button type="button" className="cursor-grab touch-none p-1 text-muted-foreground" aria-label="Drag to reorder" {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>
      <PlatformIcon platform={link.platform} />
      <div className="w-28 shrink-0 text-sm font-medium">
        {link.platform === "custom" ? (
          <Input value={link.label ?? ""} onChange={(e) => onChange({ ...link, label: e.target.value })} placeholder="Label" className="h-8" />
        ) : (
          platformMeta(link.platform).name
        )}
      </div>
      <Input value={link.url} onChange={(e) => onChange({ ...link, url: e.target.value })} className="h-8 min-w-0 flex-1 basis-full sm:basis-auto" />
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={link.isActive} onChange={(e) => onChange({ ...link, isActive: e.target.checked })} className="h-4 w-4" /> Active
      </label>
      <Button type="button" size="icon" variant="ghost" onClick={onRemove} aria-label="Remove"><Trash2 /></Button>
    </div>
  );
}

export function LinkEditor({ releaseId, initial }: { releaseId: string; initial: Omit<L, "key">[] }) {
  const router = useRouter();
  const [links, setLinks] = useState<L[]>(initial.map((l, i) => ({ ...l, key: `${l.platform}-${i}-${Math.random()}` })));
  const [newPlatform, setNewPlatform] = useState("beatport");
  const [newUrl, setNewUrl] = useState("");
  const [busy, setBusy] = useState<"save" | "resolve" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    setLinks((ls) => arrayMove(ls, ls.findIndex((l) => l.key === e.active.id), ls.findIndex((l) => l.key === e.over!.id)));
  };

  async function save() {
    setBusy("save");
    setMsg(null);
    const res = await fetch(`/api/admin/releases/${releaseId}/links`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ links: links.map(({ key: _k, ...l }) => l) }) });
    const j = await res.json();
    setBusy(null);
    setMsg(res.ok ? "Saved" : j.error);
    if (res.ok) router.refresh();
  }

  async function reresolve() {
    setBusy("resolve");
    const res = await fetch(`/api/admin/releases/${releaseId}/reresolve`, { method: "POST" });
    const j = await res.json();
    setBusy(null);
    setMsg(res.ok ? (j.added ? `Added ${j.added} platform${j.added === 1 ? "" : "s"}` : j.note) : j.error);
    if (j.added) window.location.reload();
  }

  const add = () => {
    if (!newUrl) return;
    const platform = newPlatform === "auto" ? guessPlatformFromUrl(newUrl) : newPlatform;
    setLinks((ls) => [...ls, { key: `${platform}-${Date.now()}`, platform, url: newUrl.trim(), label: platform === "custom" ? "Link" : null, isActive: true }]);
    setNewUrl("");
  };

  return (
    <div className="space-y-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={links.map((l) => l.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {links.map((l, i) => (
              <Row key={l.key} link={l} onChange={(n) => setLinks((ls) => ls.map((x, j) => (j === i ? n : x)))} onRemove={() => setLinks((ls) => ls.filter((_, j) => j !== i))} />
            ))}
            {!links.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No links yet.</p>}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex flex-col gap-2 rounded-xl border border-dashed p-3 sm:flex-row">
        <Select value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)} className="sm:w-48">
          <optgroup label="Stores & DJ">
            {MANUAL_PLATFORMS.map((p) => <option key={p} value={p}>{platformMeta(p).name}{p === "custom" ? " (custom URL)" : ""}</option>)}
          </optgroup>
          <optgroup label="Other">
            <option value="auto">Detect from URL</option>
            {PLATFORM_KEYS.filter((p) => !MANUAL_PLATFORMS.includes(p)).map((p) => <option key={p} value={p}>{platformMeta(p).name}</option>)}
          </optgroup>
        </Select>
        <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://www.beatport.com/release/…" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        <Button type="button" variant="secondary" onClick={add}><Plus /> Add platform</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={!!busy}>{busy === "save" && <Loader2 className="animate-spin" />} Save links</Button>
        <Button variant="outline" onClick={reresolve} disabled={!!busy}>{busy === "resolve" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Re-resolve with Odesli</Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
