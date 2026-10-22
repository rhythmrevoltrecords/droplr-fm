"use client";
import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LabelBadge } from "@/lib/bio-label";
import { isOwnImage, type BioItem, type MerchDisplay } from "@/lib/bio-items";
import type { BioSocial } from "@/lib/bio-socials";
import { SITE_URL } from "@/lib/env";
import { labelBadgeLine } from "@/lib/bio-label";
import { BioView, type BioViewData } from "@/components/public/bio-view";
import { PageLookFields } from "./page-look-fields";
import { PhonePreview } from "./phone-preview";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { BioFontId, BioThemeId } from "@/lib/bio-themes";
import type { IconStyle } from "@/lib/page-look";
import { BIO_SUBSCRIBE_TEXT_MAX, DEFAULT_SUBSCRIBE_TEXT, subscribeButtonText, subscribeConsentLine } from "@/lib/bio-subscribe";
import { SECTION_HINTS, SECTION_LABELS, moveSection, sectionOrder, serialiseOrder } from "@/lib/bio-sections";
import { missingFields, missingLine } from "@/lib/bio-form-check";
import { slugify } from "@/lib/utils";
import { ASPECT_SQUARE, IMAGE_HINT, useImageUpload } from "./image-crop-dialog";

type Values = { title: string; slug: string; bio: string; imageUrl: string; accentColor: string; theme: BioThemeId; font: BioFontId; artistProfileId: string; releaseBlock: string; backgroundUrl: string; backgroundColor: string; buttonColor: string; textColor: string; glowColor: string; iconStyle: IconStyle; iconColor: string; labelBadge: string; subscribe: string; subscribeText: string; sectionOrder: string; gallery: string; socialIcons: string; isPublic: boolean };

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
  linkedLabels = [],
  glow,
  previewMerch,
  previewVideos,
  previewMerchDisplay,
  socialsFor,
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
   * Labels whose roster this account is on. Shown to the artist, not used for anything else: a
   * one-way rule that quietly became two-way is worse than one that never existed.
   */
  linkedLabels?: string[];
  /**
   * The account's public glow setting. Required, not optional: the preview silently ignoring it
   * is exactly how "turn the glow off" looked broken on three themes out of four.
   */
  glow: { on: boolean; color: string | null };
  /** The merch and video blocks as they are saved. Required for the same reason `glow` is. */
  previewMerch: BioItem[];
  previewVideos: BioItem[];
  previewMerchDisplay: MerchDisplay;
  /**
   * The icons each choice of "This page is for" would show, keyed by artist id, and "" for the page's
   * own default (an artist account's profile; nothing for a label's own page). Resolved on the
   * server so the preview follows the dropdown without a round trip.
   */
  socialsFor: Record<string, BioSocial[]>;
}) {
  const router = useRouter();
  const [v, setV] = useState<Values>(initial);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Reconciled, not trusted: the same function the public page uses, so the preview cannot show
  // an order the live page would not render.
  const order = sectionOrder(v.sectionOrder);
  const reorder = (i: number, d: -1 | 1) => set("sectionOrder", serialiseOrder(moveSection(order, i, d)));

  const accentPreview = v.accentColor || "#7c3aed";
  const missing = missingFields(v);
  const socials = socialsFor[v.artistProfileId] ?? socialsFor[""] ?? [];

  const set = (k: keyof Values, val: string | boolean) =>
    setV((x) => {
      const next = { ...x, [k]: val };
      if (k === "title" && !slugTouched) next.slug = slugify(String(val));
      // New artwork URL typed by hand → let the server re-extract the vibrant colour
      if (k === "imageUrl") next.accentColor = "";
      return next;
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
          <div className="space-y-2"><Label>Name</Label><Input value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Your artist name" /></div>
          <div className="space-y-2">
            {/* "Slug" is a word from the inside of a CMS. The artist picking it has never heard it. */}
            <Label>Page address</Label>
            <Input value={v.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} placeholder="yourname" />
            <p className="truncate text-xs text-muted-foreground">droplr.fm/b/<span className="text-foreground">{slugify(v.slug) || "yourname"}</span></p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Bio</Label>
            <textarea value={v.bio} maxLength={280} rows={3} onChange={(e) => set("bio", e.target.value)} placeholder="UK garage from Brisbane." className="w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Social icons</Label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.socialIcons === "on"} onChange={(e) => set("socialIcons", e.target.checked ? "on" : "")} className="h-4 w-4" />
              Show my social icons under my name
            </label>
            <p className="text-xs text-muted-foreground">
              {socials.length > 0
                ? `${socials.map((x) => x.label).join(", ")}. They come from your profile, so change a handle there and it changes here too.`
                : "None yet. Add your Instagram, TikTok and the rest to your profile and they show up here by themselves."}{" "}
              <a href={v.artistProfileId ? `/admin/artists/${v.artistProfileId}` : "/admin/artists"} className="underline">Edit on your profile</a>
            </p>
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
          <PageLookFields
            value={{ theme: v.theme, font: v.font, buttonColor: v.buttonColor, backgroundUrl: v.backgroundUrl, backgroundColor: v.backgroundColor, textColor: v.textColor, glowColor: v.glowColor, iconStyle: v.iconStyle, iconColor: v.iconColor }}
            glowDefault={glow.color || accentPreview}
            onChange={(patch) => { setMsg(null); setV((x) => ({ ...x, ...patch })); }}
            accentPreview={accentPreview}
            sample={v.title || "Your name"}
            fontNote="The preview on the right is the real page. Changes save when you hit Save."
          />

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
            <Label>Order of the page</Label>
            <p className="text-xs text-muted-foreground">
              Your picture and name always sit at the top. Everything else goes in the order you put it here.
            </p>
            <ul className="divide-y rounded-lg border border-input">
              {order.map((sec, i) => (
                <li key={sec} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{SECTION_LABELS[sec]}</span>
                    <span className="block text-xs text-muted-foreground">{SECTION_HINTS[sec]}</span>
                  </span>
                  {/* Two buttons rather than dragging. These pages are edited on a phone as often
                      as not, and a drag handle on a touch screen fights the page's own scroll. */}
                  <Button type="button" variant="ghost" size="sm" aria-label={`Move ${SECTION_LABELS[sec]} up`} disabled={i === 0} onClick={() => reorder(i, -1)}>&uarr;</Button>
                  <Button type="button" variant="ghost" size="sm" aria-label={`Move ${SECTION_LABELS[sec]} down`} disabled={i === order.length - 1} onClick={() => reorder(i, 1)}>&darr;</Button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              A block you have switched off keeps its place here and simply doesn&apos;t appear on the page.
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Email list</Label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.subscribe === "on"} onChange={(e) => set("subscribe", e.target.checked ? "on" : "")} className="h-4 w-4" />
              Let fans give me their email address
            </label>
            {v.subscribe === "on" && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Button says</span>
                <Input
                  value={v.subscribeText}
                  maxLength={BIO_SUBSCRIBE_TEXT_MAX}
                  onChange={(e) => set("subscribeText", e.target.value)}
                  placeholder={DEFAULT_SUBSCRIBE_TEXT}
                  className="h-9 w-56"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              A box under your links. The fan ticks &ldquo;{subscribeConsentLine(orgName)}&rdquo; before the
              button does anything, and that wording is stored against their address so you can always show what
              they agreed to.
            </p>
            <p className="text-xs text-muted-foreground">
              These addresses land in Fans, under <strong className="text-foreground">From your pages</strong>. You
              can see every one of them on any plan. Downloading the list as a file starts at A$12 a month, and the
              whole list downloads on any plan if you ever close your account. They are never added to a release-day
              email &mdash; only to a news email you write and send yourself.
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Latest release</Label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.releaseBlock === "on"} onChange={(e) => set("releaseBlock", e.target.checked ? "on" : "")} className="h-4 w-4" />
              Show my latest release at the top of the page
            </label>
            {artists.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">This page is for</span>
                <select
                  value={v.artistProfileId}
                  onChange={(e) => set("artistProfileId", e.target.value)}
                  /* Not tied to the release box any more: the social icons read this artist's profile too. */
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

          <div className="space-y-1 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.isPublic} onChange={(e) => set("isPublic", e.target.checked)} className="h-4 w-4" /> Public</label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.gallery === "on"} onChange={(e) => set("gallery", e.target.checked ? "on" : "")} className="h-4 w-4" />
              Show it in the gallery
            </label>
            <p className="text-xs text-muted-foreground">
              Puts your picture, name, bio line and page address on <a href="/b" target="_blank" rel="noreferrer" className="underline">droplr.fm/b</a>,
              a list of real pages people can open. Never your numbers. Untick it, or untick Public, and it comes off.
              {v.gallery === "on" && (mode === "create" || previewLinks.length === 0) && " It won't show until the page has at least one link."}
              {v.gallery === "on" && v.imageUrl && !isOwnImage(v.imageUrl, SITE_URL) && " It won't show until the picture is uploaded here rather than linked from another site."}
            </p>
            {linkedLabels.length > 0 && (
              <p className="text-xs text-muted-foreground">
                While it&apos;s public, {linkedLabels.join(" and ")} can see and share this page&apos;s link from their
                roster. They can&apos;t edit it, and your views and clicks stay yours. Untick Public and it disappears
                from their side too.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={busy || missing.length > 0}>{busy && <Loader2 className="animate-spin" />} {mode === "create" ? "Create bio link" : "Save"}</Button>
          {/* A disabled button with no reason beside it is a button that looks broken. Say what is
              left, in the words on the form, until there is nothing left to say. */}
          {missing.length > 0 && !msg && <span className="text-sm text-muted-foreground">{missingLine(missing)}</span>}
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</span>}
          {mode === "edit" && <Button variant="destructive" className="ml-auto" onClick={remove}>Delete</Button>}
        </div>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        {v.imageUrl ? (
          <PhonePreview className="shadow-[0_0_60px_-20px_rgba(124,58,237,0.5)]">
            <BioView preview labels={v.labelBadge === "on" ? labelBadges : []} page={{ title: v.title || "Name", bio: v.bio || null, imageUrl: v.imageUrl, accentColor: v.accentColor || null, theme: v.theme, font: v.font, releases: v.releaseBlock === "on" ? previewReleases : [], background: { url: v.backgroundUrl, color: v.backgroundColor }, buttonColor: v.buttonColor, textColor: v.textColor || null, glowColor: v.glowColor || null, iconStyle: v.iconStyle, iconColor: v.iconColor || null, links: previewLinks, merch: previewMerch, videos: previewVideos, merchDisplay: previewMerchDisplay, socials: v.socialIcons === "on" ? socials.map((x) => ({ key: x.key, label: x.label, href: "#" })) : [] }} orgName={orgName} showBranding={showBranding} glow={glow} subscribe={{ on: v.subscribe === "on", pageId: id ?? "preview", buttonText: v.subscribeText || null }} order={order} />
          </PhonePreview>
        ) : (
          <div className="mx-auto grid h-[510px] w-[300px] place-items-center rounded-[2rem] border border-white/10 bg-black p-6 text-center text-sm text-muted-foreground shadow-[0_0_60px_-20px_rgba(124,58,237,0.5)]">Add an image to preview the page</div>
        )}
      </div>
    </div>
  );
}
