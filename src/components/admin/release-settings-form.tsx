"use client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import type { ArtistOption } from "./release-create-form";

type Initial = { title: string; artistName: string; coverUrl: string; accentColor: string; slug: string; releaseDateLocal: string; artistProfileId: string; spotifyAlbumId: string; spotifyTrackId: string; spotifyArtistId: string; upc: string; isrc: string; autoReResolve: boolean; isPublic: boolean };

export function ReleaseSettingsForm({ releaseId, initial, artists, locationLabel = "Brisbane" }: { releaseId: string; initial: Initial; artists: ArtistOption[]; locationLabel?: string }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof Initial, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true);
    // Only send the artist when it changed: a legacy release assigned to a login without a profile keeps its access.
    const { artistProfileId, ...rest } = f;
    const payload = { ...rest, accentColor: f.accentColor || null, ...(artistProfileId !== initial.artistProfileId ? { artistProfileId: artistProfileId || null } : {}) };
    const res = await fetch(`/api/admin/releases/${releaseId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await res.json();
    setBusy(false);
    setMsg(res.ok ? "Saved" : j.error);
    if (res.ok) router.refresh();
  }
  async function del() {
    if (!confirm("Delete this release and all its analytics and pre-saves?")) return;
    await fetch(`/api/admin/releases/${releaseId}`, { method: "DELETE" });
    router.push("/admin");
  }

  const field = (k: keyof Initial, label: string, type = "text") => (
    <div className="space-y-2"><Label>{label}</Label><Input type={type} value={String(f[k])} onChange={(e) => set(k, e.target.value)} /></div>
  );
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {field("title", "Title")}
        {field("artistName", "Artist name")}
        {field("slug", "Slug")}
        {field("releaseDateLocal", `Release date & time (${locationLabel})`, "datetime-local")}
        {field("coverUrl", "Cover URL")}
        {field("accentColor", "Accent colour")}
        {field("spotifyAlbumId", "Spotify album ID")}
        {field("spotifyTrackId", "Spotify track ID")}
        {field("spotifyArtistId", "Spotify artist ID (follow)")}
        {field("upc", "UPC (finds Apple Music + Deezer)")}
        {field("isrc", "ISRC")}
        <div className="space-y-2">
          <Label>Roster artist</Label>
          <Select
            value={f.artistProfileId}
            onChange={(e) => {
              const id = e.target.value;
              // Picking a roster artist fills an empty artist name.
              setF((x) => ({ ...x, artistProfileId: id, artistName: x.artistName.trim() ? x.artistName : artists.find((a) => a.id === id)?.name ?? "" }));
            }}
          >
            <option value="">— Label only —</option>
            {artists.map((a) => <option key={a.id} value={a.id}>{a.name}{a.hasLogin ? " (has login)" : ""}</option>)}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.autoReResolve} onChange={(e) => set("autoReResolve", e.target.checked)} className="h-4 w-4" /> Auto re-resolve links on release day</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isPublic} onChange={(e) => set("isPublic", e.target.checked)} className="h-4 w-4" /> Public</label>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save</Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        <Button variant="destructive" className="ml-auto" onClick={del}>Delete release</Button>
      </div>
    </div>
  );
}
