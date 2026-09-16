"use client";
import { Loader2, Upload, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { platformMeta } from "@/lib/platforms";
import { slugify } from "@/lib/utils";
import { PlatformIcon } from "@/components/public/platform-icon";

type Resolved = {
  appleFound: boolean;
  deezerFound: boolean;
  via: { appleMusic?: string; deezer?: string };
  notes: string[];
  upc: string | null;
  isrc: string | null;
  title: string;
  artistName: string;
  coverUrl: string;
  accentColor: string | null;
  spotifyUrl: string | null;
  spotifyAlbumId: string | null;
  spotifyTrackId: string | null;
  spotifyArtistId: string | null;
  suggestedSlug: string;
  links: { platform: string; url: string }[];
};

export function ReleaseCreateForm({ artists, defaultDate }: { artists: { id: string; name: string }[]; defaultDate: string }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [upcIn, setUpcIn] = useState("");
  const [isrcIn, setIsrcIn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [r, setR] = useState<Resolved | null>(null);
  const [form, setForm] = useState({ title: "", artistName: "", coverUrl: "", accentColor: "", slug: "", releaseDateLocal: defaultDate, artistId: "", spotifyAlbumId: "", spotifyTrackId: "", spotifyArtistId: "", upc: "", isrc: "", autoReResolve: true });
  const [links, setLinks] = useState<{ platform: string; url: string; visible: boolean }[]>([]);
  const [slugTouched, setSlugTouched] = useState(false);
  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (!slugTouched && (k === "title" || k === "artistName")) next.slug = slugify(`${next.artistName} ${next.title}`.trim());
      return next;
    });

  async function resolve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url || undefined, upc: upcIn || undefined, isrc: isrcIn || undefined }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setR(j);
      setForm((f) => ({
        ...f,
        title: j.title, artistName: j.artistName, coverUrl: j.coverUrl, accentColor: j.accentColor ?? "", slug: j.suggestedSlug,
        spotifyAlbumId: j.spotifyAlbumId ?? "", spotifyTrackId: j.spotifyTrackId ?? "", spotifyArtistId: j.spotifyArtistId ?? "",
        upc: j.upc ?? "", isrc: j.isrc ?? "",
        autoReResolve: true,
      }));
      setLinks(j.links.map((l: { platform: string; url: string }) => ({ ...l, visible: true })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/upload-cover", { method: "POST", body: fd });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setError(j.error);
    setForm((f) => ({ ...f, coverUrl: j.url, accentColor: j.accentColor ?? f.accentColor }));
  }

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, accentColor: form.accentColor || null, artistId: form.artistId || null, spotifyUrl: r?.spotifyUrl, upc: form.upc || null, isrc: form.isrc || null, links }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setError(j.error);
    router.push(`/admin/releases/${j.id}?tab=links&created=1`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Spotify link + UPC / ISRC</CardTitle>
            <CardDescription>
              Spotify link or URI (Spotify for Artists → Music → Upcoming → Share → Copy URI) for title and artwork.
              UPC and ISRC (on your DistroKid release page) find Apple Music and Deezer automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://open.spotify.com/album/… or spotify:album:…" />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={upcIn} onChange={(e) => setUpcIn(e.target.value)} placeholder="UPC, e.g. 701508333538" inputMode="numeric" />
              <Input value={isrcIn} onChange={(e) => setIsrcIn(e.target.value)} placeholder="ISRC, e.g. QZDA82600001" />
              <Button onClick={resolve} disabled={busy || (!url && !upcIn && !isrcIn)} className="shrink-0">{busy ? <Loader2 className="animate-spin" /> : <Wand2 />} Resolve</Button>
            </div>
          </CardContent>
        </Card>

        {r && (!r.appleFound || !r.deezerFound || r.notes.length > 0) && (
          <Card className="border-amber-500/40 bg-amber-500/10">
            <CardContent className="space-y-1 p-4 text-sm text-amber-100">
              {(!r.appleFound || !r.deezerFound) && (
                <p>
                  <strong>{!r.appleFound && !r.deezerFound ? "Apple Music and Deezer aren't" : !r.appleFound ? "Apple Music isn't" : "Deezer isn't"} listed yet.</strong>{" "}
                  {r.upc || r.isrc
                    ? <>That&apos;s normal before release day. With <em>Auto re-resolve on release day</em> on, the hourly job looks them up by {r.upc ? "UPC" : "ISRC"} once the release is live and keeps retrying for 72 hours.</>
                    : <>Add the UPC or ISRC so they can be found automatically, or add the links by hand on the next screen.</>}
                </p>
              )}
              {r.notes.map((n) => <p key={n}>{n}</p>)}
            </CardContent>
          </Card>
        )}

        {r && (
          <Card>
            <CardHeader><CardTitle>2. Details</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} /></div>
              <div className="space-y-2"><Label>Artist name</Label><Input value={form.artistName} onChange={(e) => set("artistName", e.target.value)} /></div>
              <div className="space-y-2"><Label>Slug</Label><Input value={form.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} /></div>
              <div className="space-y-2"><Label>Release date &amp; time (Brisbane)</Label><Input type="datetime-local" value={form.releaseDateLocal} onChange={(e) => set("releaseDateLocal", e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Assign to artist login</Label>
                <Select value={form.artistId} onChange={(e) => set("artistId", e.target.value)}>
                  <option value="">— Label only —</option>
                  {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </div>
              <div className="space-y-2"><Label>Accent colour</Label><Input value={form.accentColor} onChange={(e) => set("accentColor", e.target.value)} placeholder="#8B5CF6" /></div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Cover image</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input value={form.coverUrl} onChange={(e) => set("coverUrl", e.target.value)} placeholder="https://…" />
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm hover:bg-accent">
                    <Upload className="h-4 w-4" /> Upload
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                  </label>
                </div>
              </div>
              <div className="space-y-2"><Label>Spotify album ID</Label><Input value={form.spotifyAlbumId} onChange={(e) => set("spotifyAlbumId", e.target.value)} /></div>
              <div className="space-y-2"><Label>Spotify artist ID (for follow)</Label><Input value={form.spotifyArtistId} onChange={(e) => set("spotifyArtistId", e.target.value)} placeholder="optional" /></div>
              <div className="space-y-2"><Label>UPC</Label><Input value={form.upc} onChange={(e) => set("upc", e.target.value)} placeholder="Finds Apple Music + Deezer" inputMode="numeric" /></div>
              <div className="space-y-2"><Label>ISRC</Label><Input value={form.isrc} onChange={(e) => set("isrc", e.target.value)} placeholder="Backup lookup for singles" /></div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={form.autoReResolve} onChange={(e) => set("autoReResolve", e.target.checked)} className="h-4 w-4" />
                Auto re-resolve links on release day
              </label>
            </CardContent>
          </Card>
        )}

        {r && (
          <Card>
            <CardHeader><CardTitle>3. Platforms found</CardTitle><CardDescription>Add Beatport, Traxsource, Bandcamp, Juno and custom buttons on the next screen, where you can also hide, rename and reorder them.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {links.map((l, i) => (
                <label key={l.platform + i} className="flex items-center gap-3 rounded-lg border p-2">
                  <input type="checkbox" checked={l.visible} onChange={(e) => setLinks((ls) => ls.map((x, j) => (j === i ? { ...x, visible: e.target.checked } : x)))} className="h-4 w-4" />
                  <PlatformIcon platform={l.platform} />
                  <span className="w-32 text-sm font-medium">{platformMeta(l.platform).name}</span>
                  <span className="truncate text-xs text-muted-foreground">{l.url}</span>
                  {l.platform !== "spotify" && r.via[l.platform as "appleMusic" | "deezer"] && <span className="ml-auto shrink-0 text-[11px] text-emerald-400">via {r.via[l.platform as "appleMusic" | "deezer"]}</span>}
                </label>
              ))}
            </CardContent>
          </Card>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
        {r && <Button size="lg" onClick={create} disabled={busy || !form.title || !form.coverUrl || !form.slug}>{busy && <Loader2 className="animate-spin" />} Create release</Button>}
      </div>

      {r && (
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="overflow-hidden rounded-2xl border bg-black p-5" style={{ background: `radial-gradient(100% 60% at 50% 0%, ${form.accentColor || "#8B5CF6"}55, #000 70%)` }}>
            {form.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.coverUrl} alt="" className="aspect-square w-full rounded-xl object-cover" />
            ) : (
              <div className="grid aspect-square w-full place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">No cover yet</div>
            )}
            <div className="mt-4 text-center">
              <div className="font-semibold">{form.title || "Title"}</div>
              <div className="text-sm text-white/70">{form.artistName || "Artist"}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
