"use client";
import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BioView } from "@/components/public/bio-view";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { slugify } from "@/lib/utils";

type Values = { title: string; slug: string; bio: string; imageUrl: string; accentColor: string; isPublic: boolean };

export function BioForm({
  mode,
  id,
  initial,
  previewLinks = [],
  orgName,
  showBranding,
}: {
  mode: "create" | "edit";
  id?: string;
  initial: Values;
  previewLinks?: { id: string; platform: string; label: string | null }[];
  orgName: string;
  showBranding: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<Values>(initial);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (k: keyof Values, val: string | boolean) =>
    setV((x) => {
      const next = { ...x, [k]: val };
      if (k === "title" && !slugTouched) next.slug = slugify(String(val));
      // New artwork URL typed by hand → let the server re-extract the vibrant colour
      if (k === "imageUrl") next.accentColor = "";
      return next;
    });

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/upload-cover", { method: "POST", body: fd });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: j.error });
    setV((x) => ({ ...x, imageUrl: j.url, accentColor: j.accentColor ?? "" }));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(mode === "create" ? "/api/admin/bio" : `/api/admin/bio/${id}`, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...v, bio: v.bio || null }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: j.error });
    if (mode === "create") router.push(`/admin/bio/${j.id}?created=1`);
    else {
      setMsg({ ok: true, text: "Saved" });
      router.refresh();
    }
  }

  async function remove() {
    if (!confirm("Delete this bio link page?")) return;
    await fetch(`/api/admin/bio/${id}`, { method: "DELETE" });
    router.push("/admin/bio");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Name</Label><Input value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="OTOTO" /></div>
          <div className="space-y-2"><Label>Slug</Label><Input value={v.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} placeholder="ototo" /></div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Bio</Label>
            <textarea value={v.bio} maxLength={280} rows={3} onChange={(e) => set("bio", e.target.value)} placeholder="UK garage from Brisbane." className="w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Avatar / cover image</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={v.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://…" />
              <label className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm hover:bg-accent">
                <Upload className="h-4 w-4" /> Upload
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              {v.accentColor ? (
                <><span className="inline-block h-3 w-3 rounded-full ring-1 ring-white/20" style={{ background: v.accentColor }} /> Glow colour {v.accentColor}, pulled from the image</>
              ) : (
                "The glow colour is pulled from the image automatically when you save."
              )}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.isPublic} onChange={(e) => set("isPublic", e.target.checked)} className="h-4 w-4" /> Public</label>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy || !v.title || !v.slug || !v.imageUrl}>{busy && <Loader2 className="animate-spin" />} {mode === "create" ? "Create bio link" : "Save"}</Button>
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</span>}
          {mode === "edit" && <Button variant="destructive" className="ml-auto" onClick={remove}>Delete</Button>}
        </div>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="mx-auto h-[510px] w-[300px] overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-[0_0_60px_-20px_rgba(124,58,237,0.5)]">
          {v.imageUrl ? (
            <div style={{ width: 390, height: 663, transform: "scale(0.769)", transformOrigin: "top left" }}>
              <BioView preview page={{ title: v.title || "Name", bio: v.bio || null, imageUrl: v.imageUrl, accentColor: v.accentColor || null, links: previewLinks }} orgName={orgName} showBranding={showBranding} />
            </div>
          ) : (
            <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">Add an image to preview the page</div>
          )}
        </div>
      </div>
    </div>
  );
}
