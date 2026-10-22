/**
 * Release clip colours. Pure module: the clip panel, the frame renderer and the tests all import it.
 *
 * Same shape as the bio page's look picker on purpose: a few looks that are each safe on their own,
 * plus three colour overrides (background, spectrum, text) for an artist who has a brand to match.
 * The looks are the starting point and the overrides are the exception, so an artist who never
 * touches a picker still gets a clip that reads.
 *
 * The one thing an override can't do is make the words unreadable by accident. If the artist picks
 * a background and leaves the text alone, the text follows the background (white on dark, near-black
 * on light). If they pick both and the pair is hard to read, the panel says so in plain words rather
 * than refusing: it's their video, and some brands really are pale-on-pale.
 */
import { contrastRatio, readableTextOn } from "./bio-themes";
import { isHex, mixHex, partnerHex } from "./clip";

export type ClipLookId = "glow" | "light" | "mono";

export type ClipLookMeta = {
  id: ClipLookId;
  /** Shown on the picker tile. Plain words. */
  name: string;
  blurb: string;
};

export const CLIP_LOOKS: readonly ClipLookMeta[] = [
  { id: "glow", name: "Glow", blurb: "Dark, lit by your artwork's colour." },
  { id: "light", name: "Light", blurb: "Off-white with dark text." },
  { id: "mono", name: "Mono", blurb: "Black and white, no glow." },
] as const;

export const DEFAULT_CLIP_LOOK: ClipLookId = "glow";

/** What the artist has picked by hand. Null or missing means "use the look's own colour". */
export type ClipColourOverrides = {
  background?: string | null;
  spectrum?: string | null;
  text?: string | null;
};

/** Everything the frame renderer needs to paint, already resolved. */
export type ClipPalette = {
  bg: string;
  /** Headline. */
  text: string;
  /** The line under the link: the text colour pulled toward the background. */
  subtext: string;
  /** The droplr mark: quieter again. */
  mark: string;
  /** Spectrum runs from one to the other across the bands. Equal when the artist picked one colour. */
  spectrumFrom: string;
  spectrumTo: string;
  /** The printed link and the progress bar. */
  link: string;
  /** Glow behind the artwork, or null for no glow at all. */
  glow: string | null;
  glow2: string | null;
  /** Hairline round the artwork: light on a dark background, dark on a light one. */
  artEdge: string;
};

const LOOK_BASE: Record<ClipLookId, { bg: string; text: string; glow: boolean; mono: boolean }> = {
  glow: { bg: "#0B0A10", text: "#F4F4F5", glow: true, mono: false },
  light: { bg: "#F5F3EF", text: "#141218", glow: true, mono: false },
  mono: { bg: "#000000", text: "#FFFFFF", glow: false, mono: true },
};

export function clipLookOf(value: string | null | undefined): ClipLookId {
  return CLIP_LOOKS.some((l) => l.id === value) ? (value as ClipLookId) : DEFAULT_CLIP_LOOK;
}

export function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const contrastOf = (a: string, b: string) => contrastRatio(rgbOf(a), rgbOf(b));

const isLightBg = (hex: string) => readableTextOn(hex) === "#0a0a0a";

const hexOf = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/**
 * A default colour moved just far enough from the background to show, keeping its hue. Artwork
 * colours are often pale, and a pale accent on the Light look would leave the spectrum invisible
 * without the artist having picked anything. Never applied to a colour the artist chose.
 */
function visibleOn(hex: string, bg: string, min: number): string {
  if (contrastOf(hex, bg) >= min) return hex;
  const rgb = rgbOf(hex);
  const toward = isLightBg(bg) ? 0 : 255;
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const shade = hexOf(rgb.map((v) => v + (toward - v) * t));
    if (contrastOf(shade, bg) >= min) return shade;
  }
  return toward === 0 ? "#000000" : "#ffffff";
}

/** "#AbC" and friends are not accepted anywhere in the clip; only #rrggbb. */
const pick = (v: string | null | undefined) => (isHex(v) ? v.toLowerCase() : null);

export function clipPalette(look: ClipLookId, accent: string, overrides: ClipColourOverrides = {}): ClipPalette {
  const base = LOOK_BASE[look];
  const bg = pick(overrides.background) ?? base.bg;
  const textOverride = pick(overrides.text);
  // The look's own text colour, unless the artist moved the background somewhere it can't be read.
  const text = textOverride ?? (contrastOf(base.text, bg) >= 4.5 ? base.text : readableTextOn(bg));

  const spectrumPick = pick(overrides.spectrum);
  const from = spectrumPick ?? (base.mono ? text : visibleOn(accent, bg, 2));
  const to = spectrumPick ?? (base.mono ? text : visibleOn(partnerHex(accent), bg, 2));

  // The link has to be read and typed, so it only takes the spectrum colour when that colour holds
  // up against the background. Otherwise it falls back to the text colour.
  const link = contrastOf(from, bg) >= 3 ? from : text;

  return {
    bg,
    text,
    subtext: mixHex(text, bg, 0.35),
    mark: mixHex(text, bg, 0.45),
    spectrumFrom: from,
    spectrumTo: to,
    link,
    glow: base.glow ? accent : null,
    glow2: base.glow ? partnerHex(accent) : null,
    artEdge: isLightBg(bg) ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.10)",
  };
}

/**
 * Plain-words warnings for the panel. Empty for every look as shipped, whatever the artwork colour,
 * so a warning only ever appears because of something the artist picked.
 */
export function clipColourWarnings(p: ClipPalette): string[] {
  const out: string[] = [];
  if (contrastOf(p.text, p.bg) < 4.5) out.push("Your text will be hard to read on this background.");
  if (contrastOf(p.spectrumFrom, p.bg) < 1.5 && contrastOf(p.spectrumTo, p.bg) < 1.5) out.push("The spectrum will barely show against this background.");
  return out;
}
