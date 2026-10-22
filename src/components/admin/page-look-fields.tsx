"use client";
import { Loader2, Upload } from "lucide-react";
import { bioFontClass } from "@/components/public/bio-fonts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { BIO_FONTS, BIO_THEMES, readableTextOn, type BioFontId, type BioThemeId } from "@/lib/bio-themes";
import { BLUR_LABELS, BLUR_LEVELS, ICON_STYLES, ICON_STYLE_LABELS, lookWarnings, themeInk, type BlurLevel, type IconStyle } from "@/lib/page-look";
import { useImageUpload } from "./image-crop-dialog";

export type LookValues = { theme: BioThemeId; font: BioFontId; buttonColor: string; backgroundUrl: string; backgroundColor: string; textColor: string; glowColor: string; iconStyle: IconStyle; iconColor: string; backgroundBlur: BlurLevel };

/**
 * Look, font, button colour and background: the bio page's look controls, shared with the release
 * page's Look tab so the two can't drift. Controlled; the parent owns saving.
 *
 * Renders a fragment of full-width grid cells, so it drops into the bio form's two-column grid as
 * it always did.
 */
export function PageLookFields({
  value, onChange, accentPreview, sample, fontNote, sampleButton = "Listen", glowDefault, socials,
}: {
  /** What the glow is when nothing is picked: the account's glow colour, or the colour from the artwork. */
  glowDefault: string;
  /** The "show social icons" switch, on pages where it belongs with the look (release and download pages). */
  socials?: { on: boolean; onChange: (on: boolean) => void };
  value: LookValues;
  onChange: (patch: Partial<LookValues>) => void;
  /** The page's own colour, for the theme swatches and the button colour's starting point. */
  accentPreview: string;
  /** The words each font tile is set in: the artist's name or the release title. */
  sample: string;
  fontNote?: string;
  /** The word on the swatch buttons. */
  sampleButton?: string;
}) {
  const background = useImageUpload({
    endpoint: "/api/admin/upload-cover",
    purpose: "background",
    // Free aspect: a background is cropped by the viewport, not by us.
    aspects: [],
    maxEdge: 1600,
    title: "Crop background",
    onUploaded: (img) => onChange({ backgroundUrl: img.url, backgroundColor: "" }),
  });

  const warnings = lookWarnings({ theme: value.theme, textColor: value.textColor || null, backgroundUrl: value.backgroundUrl || null, backgroundColor: value.backgroundColor || null });

  return (
    <>
      <div className="space-y-2 sm:col-span-2">
        <Label>Look</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BIO_THEMES.map((t) => {
            const card = t.swatch.card === "accent" ? accentPreview : t.swatch.card;
            const ink = t.swatch.card === "accent" ? readableTextOn(accentPreview) : t.swatch.text;
            const on = value.theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ theme: t.id })}
                className={`rounded-xl border p-2 text-left transition ${on ? "border-primary ring-2 ring-primary/40" : "border-input hover:border-primary/50"}`}
              >
                <span className="block space-y-1 rounded-lg p-2" style={{ background: t.swatch.bg }}>
                  <span className="mx-auto block h-5 w-5 rounded-full" style={{ background: accentPreview }} />
                  {[0, 1].map((i) => (
                    <span key={i} className="block px-1 py-[3px] text-[7px]" style={{ background: card, color: ink, borderRadius: t.id === "mono" ? 0 : 5 }}>
                      {sampleButton}
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
            const on = value.font === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ font: f.id })}
                className={`rounded-xl border px-3 py-2 text-left transition ${on ? "border-primary ring-2 ring-primary/40" : "border-input hover:border-primary/50"}`}
              >
                {/* Each option is set in the font it sells, so nobody has to imagine it. */}
                <span className={`block text-lg leading-tight ${bioFontClass(f.id)}`}>{sample}</span>
                <span className="mt-1 block text-xs font-medium">{f.name}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">{f.blurb}</span>
              </button>
            );
          })}
        </div>
        {fontNote && <p className="text-xs text-muted-foreground">{fontNote}</p>}
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label>Link buttons</Label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            Colour
            <input
              type="color"
              aria-label="Link button colour"
              value={value.buttonColor || accentPreview}
              onChange={(e) => onChange({ buttonColor: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent"
            />
          </label>
          {value.buttonColor && <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ buttonColor: "" })}>Clear</Button>}
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
            {background.uploading ? <Loader2 className="animate-spin" /> : <Upload />} {value.backgroundUrl ? "Replace image" : "Upload image"}
          </Button>
          {background.ui}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            or colour
            <input
              type="color"
              aria-label="Background colour"
              value={value.backgroundColor || "#0b0b10"}
              onChange={(e) => onChange({ backgroundColor: e.target.value, backgroundUrl: "" })}
              className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent"
            />
          </label>
          {(value.backgroundUrl || value.backgroundColor) && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ backgroundUrl: "", backgroundColor: "", backgroundBlur: "none" })}>Remove</Button>
          )}
        </div>
        {value.backgroundUrl && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Blur</span>
            {BLUR_LEVELS.map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={value.backgroundBlur === b}
                onClick={() => onChange({ backgroundBlur: b })}
                className={`rounded-md border px-3 py-1 text-xs transition ${value.backgroundBlur === b ? "border-primary ring-2 ring-primary/40" : "border-input text-muted-foreground hover:text-foreground"}`}
              >
                {BLUR_LABELS[b]}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {value.backgroundUrl
            ? "Your image, with a shade over it so the text stays readable whatever you upload. A blur is saved into the picture, so the page loads just as fast."
            : value.backgroundColor
              ? "A plain colour behind the page."
              : "Optional. Leave it empty and the page uses the colour from your picture."}
        </p>
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label>Text and glow</Label>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            Text
            <input
              type="color"
              aria-label="Text colour"
              value={value.textColor || themeInk(value.theme)}
              onChange={(e) => onChange({ textColor: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent"
            />
          </label>
          {value.textColor && <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ textColor: "" })}>Clear</Button>}
          {value.theme === "mono" ? (
            <span className="text-xs text-muted-foreground">Mono has no glow.</span>
          ) : (
            <>
              <label className="flex items-center gap-2 text-muted-foreground">
                Glow
                <input
                  type="color"
                  aria-label="Glow colour"
                  value={value.glowColor || glowDefault}
                  onChange={(e) => onChange({ glowColor: e.target.value })}
                  className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent"
                />
              </label>
              {value.glowColor && <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ glowColor: "" })}>Clear</Button>}
            </>
          )}
        </div>
        {warnings.map((w) => <p key={w} className="text-xs text-amber-400">{w}</p>)}
        <p className="text-xs text-muted-foreground">The glow starts as the colour from your picture. Poster keeps its button text black or white so it always reads.</p>
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label>Social icons</Label>
        {socials && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={socials.on} onChange={(e) => socials.onChange(e.target.checked)} className="h-4 w-4" /> Show social icons under the artist name
          </label>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ICON_STYLES.map((st) => {
            const on = value.iconStyle === st;
            return (
              <button
                key={st}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ iconStyle: st })}
                className={`rounded-xl border px-3 py-2 text-left transition ${on ? "border-primary ring-2 ring-primary/40" : "border-input hover:border-primary/50"}`}
              >
                <span className="block text-xs font-medium">{ICON_STYLE_LABELS[st].name}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">{ICON_STYLE_LABELS[st].blurb}</span>
              </button>
            );
          })}
        </div>
        {(value.iconStyle === "outline" || value.iconStyle === "solid") && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2 text-muted-foreground">
              Icon colour
              <input
                type="color"
                aria-label="Social icon colour"
                value={value.iconColor || value.textColor || themeInk(value.theme)}
                onChange={(e) => onChange({ iconColor: e.target.value })}
                className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent"
              />
            </label>
            {value.iconColor ? <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ iconColor: "" })}>Match text</Button> : <span className="text-xs text-muted-foreground">Matching your text colour.</span>}
          </div>
        )}
      </div>
    </>
  );
}
