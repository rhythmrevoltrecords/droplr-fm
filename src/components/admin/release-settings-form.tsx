"use client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { RULEBOOKS, WEEKS_BY_RULEBOOK, isRulebook } from "@/lib/exclusivity";
import type { ArtistOption } from "./release-create-form";

type Initial = { title: string; artistName: string; coverUrl: string; accentColor: string; slug: string; releaseDateLocal: string; artistProfileId: string; spotifyAlbumId: string; spotifyTrackId: string; spotifyArtistId: string; upc: string; isrc: string; autoReResolve: boolean; isPublic: boolean; rollout: "local" | "global"; exclusiveStore: string; exclusiveFromLocal: string; exclusiveWeeks: string; exclusiveRulebook: string };

export function ReleaseSettingsForm({ releaseId, initial, artists, locationLabel = "Brisbane", soloArtist = false }: { releaseId: string; initial: Initial; artists: ArtistOption[]; locationLabel?: string; soloArtist?: boolean }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof Initial, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true);
    // Only send the artist when it changed: a legacy release assigned to a login without a profile keeps its access.
    const { artistProfileId, ...rest } = f;
    const payload = {
      ...rest,
      accentColor: f.accentColor || null,
      // "" is lifetime, which is a real Beatport option, so it has to travel as null rather than
      // being dropped — dropping it would silently keep whatever window was there before.
      exclusiveWeeks: f.exclusiveStore ? (f.exclusiveWeeks ? Number(f.exclusiveWeeks) : null) : null,
      ...(artistProfileId !== initial.artistProfileId ? { artistProfileId: artistProfileId || null } : {}),
    };
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
        <div className="space-y-2 sm:col-span-2">
          <Label>Worldwide release</Label>
          <Select value={f.rollout} onChange={(e) => set("rollout", e.target.value)}>
            <option value="local">At this time in each fan&apos;s country (like the stores: midnight Brisbane, then midnight London, midnight LA…)</option>
            <option value="global">At the same moment everywhere (surprise drop)</option>
          </Select>
          <p className="text-xs text-muted-foreground">Controls when the page switches to &quot;Out now&quot;, when Spotify pre-saves land and when release-day emails go out for each fan.</p>
        </div>
        {field("coverUrl", "Cover URL")}
        {field("accentColor", "Accent colour")}
        {field("spotifyAlbumId", "Spotify album ID")}
        {field("spotifyTrackId", "Spotify track ID")}
        {field("spotifyArtistId", "Spotify artist ID (follow)")}
        {field("upc", "UPC (finds Apple Music, Deezer, Spotify, TIDAL)")}
        {field("isrc", "ISRC")}

        {/*
          Exclusivity. Four fields rather than one because the rulebook is the load-bearing part:
          Beatport says streaming is fine, LabelWorx counts Apple Music, TIDAL and SoundCloud, and
          Symphonic lets radio edits stream. droplr can only give a useful answer if it knows whose
          rules to apply, so it asks instead of averaging them.
        */}
        <div className="space-y-2 sm:col-span-2">
          <Label>Store exclusive</Label>
          <Select value={f.exclusiveStore} onChange={(e) => set("exclusiveStore", e.target.value)}>
            <option value="">No exclusive</option>
            <option value="beatport">Beatport</option>
            <option value="traxsource">Traxsource</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            droplr will warn you if a link on this release breaks the window — a Bandcamp button going live inside a
            Beatport exclusive costs you the premium price and the Hype chart.
          </p>
        </div>

        {f.exclusiveStore && (
          <>
            <div className="space-y-2">
              <Label>Whose rules?</Label>
              <Select value={f.exclusiveRulebook} onChange={(e) => set("exclusiveRulebook", e.target.value)}>
                {RULEBOOKS.map((r) => <option key={r.key} value={r.key === "unknown" ? "" : r.key}>{r.label}</option>)}
              </Select>
              <p className="text-xs text-muted-foreground">
                {RULEBOOKS.find((r) => r.key === (isRulebook(f.exclusiveRulebook) ? f.exclusiveRulebook : "unknown"))?.note}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Window</Label>
              <Select value={f.exclusiveWeeks} onChange={(e) => set("exclusiveWeeks", e.target.value)}>
                {WEEKS_BY_RULEBOOK[isRulebook(f.exclusiveRulebook) ? f.exclusiveRulebook : "unknown"].map((w) => (
                  <option key={w} value={String(w)}>{w} weeks</option>
                ))}
                <option value="">Lifetime</option>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Window starts ({locationLabel})</Label>
              <Input type="date" value={f.exclusiveFromLocal} onChange={(e) => set("exclusiveFromLocal", e.target.value)} />
              <p className="text-xs text-muted-foreground">
                The store&apos;s own live date, which for an exclusive is earlier than the release date above. Beatport
                asks for at least 7 business days&apos; notice before a window opens.
              </p>
            </div>
          </>
        )}
        {!soloArtist && <div className="space-y-2">
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
        </div>}
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
