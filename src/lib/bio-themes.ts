/**
 * Bio page looks. Pure module (no prisma, no next/font): the client form and the
 * server renderer both import it.
 *
 * Deliberately four themes and four fonts, not a style editor. Every combination
 * has to look deliberate without the artist knowing anything about design, so the
 * only choices on offer are ones that can't be made ugly. Adding a fifth needs a
 * reason, and the contrast numbers in scripts/test-bio-theme.ts have to be re-run.
 */

export type BioThemeId = "midnight" | "paper" | "mono" | "poster";
export type BioFontId = "clean" | "serif" | "rounded" | "typewriter";

export type BioThemeMeta = {
  id: BioThemeId;
  /** Shown on the picker tile. Plain words, no design jargon. */
  name: string;
  blurb: string;
  /** Swatch colours for the picker tile. "accent" means "paint the artist's own colour here". */
  swatch: { bg: string; card: string | "accent"; text: string };
};

export const BIO_THEMES: readonly BioThemeMeta[] = [
  { id: "midnight", name: "Midnight", blurb: "Dark and glassy. The one most people keep.", swatch: { bg: "#0b0b10", card: "rgba(255,255,255,0.09)", text: "#ffffff" } },
  { id: "paper", name: "Paper", blurb: "Light and clean, white buttons.", swatch: { bg: "#fafafa", card: "rgba(255,255,255,0.95)", text: "#0a0a0a" } },
  { id: "mono", name: "Mono", blurb: "Flat black, square edges, no glow.", swatch: { bg: "#000000", card: "rgba(255,255,255,0.05)", text: "#ffffff" } },
  { id: "poster", name: "Poster", blurb: "Big title, solid buttons in your own colour.", swatch: { bg: "#0b0b10", card: "accent", text: "#ffffff" } },
] as const;

export type BioFontMeta = { id: BioFontId; name: string; blurb: string };

export const BIO_FONTS: readonly BioFontMeta[] = [
  { id: "clean", name: "Clean", blurb: "Plain and modern." },
  { id: "serif", name: "Classic", blurb: "Serif, a bit editorial." },
  { id: "rounded", name: "Friendly", blurb: "Soft and rounded." },
  { id: "typewriter", name: "Typewriter", blurb: "Monospaced, technical." },
] as const;

export const DEFAULT_BIO_THEME: BioThemeId = "midnight";
export const DEFAULT_BIO_FONT: BioFontId = "clean";

const THEME_IDS = BIO_THEMES.map((t) => t.id);
const FONT_IDS = BIO_FONTS.map((f) => f.id);

export const BIO_THEME_IDS = THEME_IDS as readonly BioThemeId[];
export const BIO_FONT_IDS = FONT_IDS as readonly BioFontId[];

/** Anything unrecognised (old row, hand-edited value, dropped column) falls back to the default. */
export function bioThemeOf(value: string | null | undefined): BioThemeId {
  return THEME_IDS.includes(value as BioThemeId) ? (value as BioThemeId) : DEFAULT_BIO_THEME;
}

export function bioFontOf(value: string | null | undefined): BioFontId {
  return FONT_IDS.includes(value as BioFontId) ? (value as BioFontId) : DEFAULT_BIO_FONT;
}

export function bioThemeMeta(id: BioThemeId): BioThemeMeta {
  return BIO_THEMES.find((t) => t.id === id) ?? BIO_THEMES[0];
}

/** Paper is the existing light shell treatment, already shipped and already contrast-checked. */
export function bioThemeIsLight(id: BioThemeId): boolean {
  return id === "paper";
}

/** Mono drops the accent wash entirely: the point of it is that nothing glows. */
export function bioThemeHasGlow(id: BioThemeId): boolean {
  return id !== "mono";
}

export function bioSkinClass(id: BioThemeId): string {
  return `bio-skin-${id}`;
}

/**
 * Black or white text for a solid block of `hex`, by WCAG relative luminance.
 *
 * Poster paints buttons in the artist's own accent colour, and that colour is
 * extracted from their artwork — a pale yellow cover would otherwise put white
 * text on a near-white button. Nothing stops that but this.
 */
export function readableTextOn(hex: string | null | undefined): "#ffffff" | "#0a0a0a" {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const chan = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
  // Contrast against white vs against near-black; pick the better one.
  return (1.05 / (lum + 0.05)) >= ((lum + 0.05) / 0.0906) ? "#ffffff" : "#0a0a0a";
}

/**
 * A shade of `hex` that small text can actually sit on, keeping the hue.
 *
 * readableTextOn alone is not enough. A mid-tone accent like #339999 tops out around 3.4:1
 * against black OR white — no choice of text colour clears 4.5:1, because the problem is the
 * button, not the letters. So Poster darkens (or lightens) the fill in a straight line toward
 * black or white until the text clears, which moves the colour a little and keeps it recognisably
 * theirs. Returns the original when it already passes, so most accents are untouched.
 */
export function posterFill(hex: string | null | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return "#7c3aed";
  const n = parseInt(m[1], 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const toward = readableTextOn(m[1]) === "#ffffff" ? 0 : 255;
  const ink = readableTextOn(m[1]) === "#ffffff" ? 255 : 10;
  const hexOf = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  for (let t = 0; t <= 1.0001; t += 0.02) {
    // Round first, then measure: measuring the un-rounded shade returned a colour that
    // fell back below 4.5:1 once it was written as six hex digits (4.49:1 on #009933).
    const shade = rgb.map((v) => Math.round(v + (toward - v) * t));
    if (contrastRatio(shade, [ink, ink, ink]) >= 4.5) return hexOf(shade);
  }
  return toward === 0 ? "#000000" : "#ffffff";
}

function channelLum(v: number) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.1 contrast ratio between two sRGB triples. */
export function contrastRatio(a: number[], b: number[]): number {
  const l = (c: number[]) => 0.2126 * channelLum(c[0]) + 0.7152 * channelLum(c[1]) + 0.0722 * channelLum(c[2]);
  const [hi, lo] = [l(a), l(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
