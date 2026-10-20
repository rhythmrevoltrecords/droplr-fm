"use client";
import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LabelBadge } from "@/lib/bio-label";
import { labelBadgeLine } from "@/lib/bio-label";
import { bioFontClass } from "@/components/public/bio-fonts";
import { BioView, type BioViewData } from "@/components/public/bio-view";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { BIO_FONTS, BIO_THEMES, readableTextOn, type BioFontId, type BioThemeId } from "@/lib/bio-themes";
import { slugify } from "@/lib/utils";
import { ASPECT_SQUARE, IMAGE_HINT, useImageUpload } from "./image-crop-dialog";

type Values = { title: string; slug: string; bio: string; imageUrl: string; accentColor: string; theme: BioThemeId; font: BioFontId; artistProfileId: string; releaseBlock: string; backgroundUrl: string; backgroundColor: string; buttonColor: string; labelBadge: string; isPublic: boolean };

export function BioForm({
  mode,
  id,
  initial,
  previewLinks = [],
  orgName,
  showBranding,
  artists = [],
  previewReleases = [],
  labelBadges = [],
  glow,
}: {
  mode: "create" | "edit";
  id?: string;
  initial: Values;
  previewLinks?: { id: string; platform: string; label: string | null; buttonText?: string | null; icon?: string | null }[];
  orgName: string;
  showBranding: boolean;
  /** Roster artists, for scoping the release block. Empty for an account with no roster. */
  artists?: { id: string; name: string }[];
  /** What the release block would show right now, resolved on the server. */
  previewReleases?: BioViewData["releases"];
  /** Labels that have allowed this artist to show their badge. Empty for a label's own page. */
  labelBadges?: LabelBadge[];
  /**
   * The account's public glow setting. Required, not optional: the preview silently ignoring it
   * is exactly how "turn the glow off" looked broken on three themes out of four.
   */
  glow: { on: boolean; color: string | null };
}) {
  const router = useRouter();
  const [v, setV] = useState<Values>(initial);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const accentPreview = v.accentColor || "#7c3aed";

  const set = (k: keyof Values, val: string | boolean) =>
    setV((x) => {
      const next = { ...x, [k]: val };
      if (k === "title" && !slugTouched) next.slug = slugify(String(val));
      // New artwork URL typed by hand → let the server re-extract the vibrant colour
      if (k === "imageUrl") next.accentColor = "";
      return next;
    });

  const background = useImageUpload({
    endpoint: "/api/admin/upload-cover",
    purpose: "background",
    // Free aspect: a background is cropped by the viewport, not by us.
    aspects: [],
    maxEdge: 1600,
    title: "Crop background",
    onUploaded: (img) => {
      setMsg(null);
      setV((x) => ({ ...x, backgroundUrl: img.url }));
    },
  });

  const image = useImageUpload({
    endpoint: "/api/admin/upload-cover",
    purpose: "avatar",
    aspects: [ASPECT_SQUARE],
    maxEdge: 1600,
    round: true,
    title: "Crop image",
    onUploaded: (img) => {
      setMsg(null);
      setV((x) => ({ ...x, imageUrl: img.url, accentColor: img.accentColor ?? "" }));
    },
  });

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
              <Button type="button" variant="outline" className="shrink-0" onClick={image.pick} disabled={image.busy}>
                {image.uploading ? <Loader2 className="animate-spin" /> : <Upload />} Upload
              </Button>
              {image.ui}
            </div>
            <p className="text-xs text-muted-foreground">{IMAGE_HINT}</p>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              {v.accentColor ? (
                <><span className="inline-block h-3 w-3 rounded-full ring-1 ring-white/20" style={{ background: v.accentColor }} /> Glow colour {v.accentColor}, pulled from the image</>
              ) : (
                "The glow colour is pulled from the image automatically when you save."
              )}
            </p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Look</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BIO_THEMES.map((t) => {
                const card = t.swatch.card === "accent" ? accentPreview : t.swatch.card;
                const ink = t.swatch.card === "accent" ? readableTextOn(accentPreview) : t.swatch.text;
                const on = v.theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("theme", t.id)}
                    className={`rounded-xl border p-2 text-left transition ${on ? "border-primary ring-2 ring-primary/40" : "border-input hover:border-primary/50"}`}
                  >
                    <span className="block space-y-1 rounded-lg p-2" style={{ background: t.swatch.bg }}>
                      <span className="mx-auto block h-5 w-5 rounded-full" style={{ background: accentPreview }} />
                      {[0, 1].map((i) => (
                        <span key={i} className="block px-1 py-[3px] text-[7px]" style={{ background: card, color: ink, borderRadius: t.id === "mono" ? 0 : 5 }}>
                          Listen
                        </span>
                      ))}
                    </span>
                    <span className="mt-1.5 block text-xs font-medium">{t.name}</span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">{t.blurb}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Font</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BIO_FONTS.map((f) => {
                const on = v.font === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("font", f.id)}
                    className={`rounded-xl border px-3 py-2 text-left transition ${on ? "border-primary ring-2 ring-primary/40" : "border-input hover:border-primary/50"}`}
                  >
                    {/* Each option is set in the font it sells, so nobody has to imagine it. */}
                    <span className={`block text-lg leading-tight ${bioFontClass(f.id)}`}>{v.title || "Your name"}</span>
                    <span className="mt-1 block text-xs font-medium">{f.name}</span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">{f.blurb}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">The preview on the right is the real page. Changes save when you hit Save.</p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Link buttons</Label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-2 text-muted-foreground">
                Colour
                <input
                  type="color"
                  aria-label="Link button colour"
                  value={v.buttonColor || v.accentColor || "#7c3aed"}
                  onChange={(e) => set("buttonColor", e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent"
                />
              </label>
              {v.buttonColor && <Button type="button" size="sm" variant="ghost" onClick={() => set("buttonColor", "")}>Clear</Button>}
            </div>
            <p className="text-xs text-muted-foreground">
              One colour, four looks: the glassy themes tint their glass with it, Poster fills the buttons solid.
              Poster darkens it if small text wouldn&apos;t read on it.
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Page background</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={background.pick} disabled={background.busy}>
                {background.uploading ? <Loader2 className="animate-spin" /> : <Upload />} {v.backgroundUrl ? "Replace image" : "Upload image"}
              </Button>
              {background.ui}
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                or colour
                <input
                  type="color"
                  aria-label="Background colour"
                  value={v.backgroundColor || "#0b0b10"}
                  onChange={(e) => setV((x) => ({ ...x, backgroundColor: e.target.value, backgroundUrl: "" }))}
                  className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent"
                />
              </label>
              {(v.backgroundUrl || v.backgroundColor) && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setV((x) => ({ ...x, backgroundUrl: "", backgroundColor: "" }))}>Remove</Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {v.backgroundUrl
                ? "Your image, with a shade over it so the text stays readable whatever you upload."
                : v.backgroundColor
                  ? "A plain colour behind the page."
                  : "Optional. Leave it empty and the page uses the colour from your picture."}
            </p>
          </div>

          {labelBadges.length > 0 && (
            <div className="space-y-2 sm:col-span-2">
              <Label>Your label</Label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={v.labelBadge === "on"} onChange={(e) => set("labelBadge", e.target.checked ? "on" : "")} className="h-4 w-4" />
                Show {labelBadges.map((l) => l.name).join(" and ")} at the bottom of the page
              </label>
              <p className="text-xs text-muted-foreground">
                Reads &ldquo;{labelBadgeLine(labelBadges[0])}&rdquo;, with their logo. It comes from their roster, so it
                goes away by itself if the link ends.
              </p>
            </div>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label>Latest release</Label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.releaseBlock === "on"} onChange={(e) => set("releaseBlock", e.target.checked ? "on" : "")} className="h-4 w-4" />
              Show my latest release at the top of the page
            </label>
            {artists.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Releases for</span>
                <select
                  value={v.artistProfileId}
                  onChange={(e) => set("artistProfileId", e.target.value)}
                  disabled={v.releaseBlock !== "on"}
                  className="rounded-lg border border-input bg-background/60 px-2 py-1.5 text-sm disabled:opacity-50"
                >
                  <option value="">Everything {orgName} puts out</option>
                  {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {previewReleases.length > 0
                ? `Right now that's "${previewReleases[0].title}"${previewReleases.length > 1 ? ` and ${previewReleases.length - 1} more below your links` : ""}. It changes by itself when you add a release \u2014 you never edit this page again.`
                : "Nothing to show yet. As soon as you add a release it appears here on its own, and updates itself after that."}
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
              <BioView preview labels={v.labelBadge === "on" ? labelBadges : []} page={{ title: v.title || "Name", bio: v.bio || null, imageUrl: v.imageUrl, accentColor: v.accentColor || null, theme: v.theme, font: v.font, releases: v.releaseBlock === "on" ? previewReleases : [], background: { url: v.backgroundUrl, color: v.backgroundColor }, buttonColor: v.buttonColor, links: previewLinks }} orgName={orgName} showBranding={showBranding} glow={glow} />
            </div>
          ) : (
            <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">Add an image to preview the page</div>
          )}
        </div>
      </div>
    </div>
  );
}
