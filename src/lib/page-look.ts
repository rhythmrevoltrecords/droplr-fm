/**
 * The look of a release, pre-save, smart link or download page: theme, font, button colour and
 * background. Pure module (zod only), shared by the Look tab, its API route and the public pages.
 *
 * The values are the bio page's, on purpose. One set of four themes and four fonts, contrast-checked
 * once in scripts/test-bio-theme.ts, and one skin stylesheet in globals.css. A release page that
 * invented its own options would need all of that again and would drift from the bio page.
 */
import { z } from "zod";
import { BIO_FONT_IDS, BIO_THEME_IDS, bioFontOf, bioThemeOf, contrastRatio, type BioFontId, type BioThemeId } from "./bio-themes";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * How the social icon row is drawn. "plain" is the row as it always was: each mark in the page's text
 * colour. "brand" uses each network's own colour. "outline" and "solid" put the mark in a ring or a
 * filled circle in a colour of the owner's choosing, which starts as the text colour.
 */
export const ICON_STYLES = ["plain", "brand", "outline", "solid"] as const;
export type IconStyle = (typeof ICON_STYLES)[number];
export const ICON_STYLE_LABELS: Record<IconStyle, { name: string; blurb: string }> = {
  plain: { name: "Plain", blurb: "In your text colour." },
  brand: { name: "Original", blurb: "Each network's own colour." },
  outline: { name: "Outline", blurb: "A ring round each icon." },
  solid: { name: "Solid", blurb: "A filled circle behind each." },
};
/**
 * Background blur. Baked into a stored copy of the image when the page is saved (lib/background-blur),
 * so fans load an ordinary picture. Only the editor's preview blurs live, and only inside its frame.
 */
export const BLUR_LEVELS = ["none", "soft", "strong"] as const;
export type BlurLevel = (typeof BLUR_LEVELS)[number];
export const BLUR_LABELS: Record<BlurLevel, string> = { none: "None", soft: "Soft", strong: "Strong" };
/** sharp blur sigma on a background stored at up to 1600px on its long edge. */
export const BLUR_SIGMA: Record<Exclude<BlurLevel, "none">, number> = { soft: 10, strong: 24 };
/** The same blur as a CSS radius for the editor's preview: the image is shown at about phone width. */
export const BLUR_PREVIEW_PX: Record<Exclude<BlurLevel, "none">, number> = { soft: 6, strong: 14 };
export const blurOf = (v: string | null | undefined): BlurLevel => (BLUR_LEVELS.includes(v as BlurLevel) ? (v as BlurLevel) : "none");

export const iconStyleOf = (v: string | null | undefined): IconStyle => (ICON_STYLES.includes(v as IconStyle) ? (v as IconStyle) : "plain");
const blank = z.literal("");

export const pageLookSchema = z
  .object({
    theme: z.enum(BIO_THEME_IDS as unknown as [string, ...string[]]).nullable().optional().or(blank),
    font: z.enum(BIO_FONT_IDS as unknown as [string, ...string[]]).nullable().optional().or(blank),
    backgroundUrl: z.string().url().max(500).nullable().optional().or(blank),
    backgroundColor: hex.nullable().optional().or(blank),
    buttonColor: hex.nullable().optional().or(blank),
    glowColor: hex.nullable().optional().or(blank),
    textColor: hex.nullable().optional().or(blank),
    iconStyle: z.enum(ICON_STYLES as unknown as [string, ...string[]]).nullable().optional().or(blank),
    iconColor: hex.nullable().optional().or(blank),
    backgroundBlur: z.enum(BLUR_LEVELS as unknown as [string, ...string[]]).nullable().optional().or(blank),
  })
  .strict();

export type PageLookInput = z.infer<typeof pageLookSchema>;

export type PageLook = {
  theme: string | null;
  font: string | null;
  backgroundUrl: string | null;
  backgroundColor: string | null;
  buttonColor: string | null;
  glowColor: string | null;
  textColor: string | null;
  iconStyle: string | null;
  iconColor: string | null;
  /** Editor preview only: the public pages are given the already-blurred image and no level. */
  backgroundBlur?: string | null;
};

export const LOOK_FIELDS = ["theme", "font", "backgroundUrl", "backgroundColor", "buttonColor", "glowColor", "textColor", "iconStyle", "iconColor"] as const;

/** The columns to write. Empty string and null both mean "back to the default", stored as NULL. */
export function lookUpdate(d: PageLookInput): Partial<PageLook> {
  const out: Partial<PageLook> = {};
  for (const k of LOOK_FIELDS) if (d[k] !== undefined) out[k] = d[k] || null;
  // "plain" is the icon row as it always was, so it is stored as NULL like every other default.
  if (out.iconStyle === "plain") out.iconStyle = null;
  // An image and a colour are alternatives. Setting one clears the other, as the bio form does.
  if (out.backgroundUrl) out.backgroundColor = null;
  else if (out.backgroundColor) out.backgroundUrl = null;
  return out;
}

/** True when any look column is set. A page with none renders exactly as it did before looks existed. */
export function hasCustomLook(r: Partial<PageLook>): boolean {
  return LOOK_FIELDS.some((k) => !!r[k]);
}

/** What the public page shell needs, resolved once so the release and download pages can't disagree. */
export function resolveLook(r: Partial<PageLook>): {
  theme: BioThemeId;
  font: BioFontId;
  /** False when nothing is set: the page keeps the shell exactly as it was, with no skin class. */
  custom: boolean;
  background: { url: string | null; color: string | null; blur?: BlurLevel } | null;
  buttonColor: string | null;
  glowColor: string | null;
  textColor: string | null;
  iconStyle: IconStyle;
  iconColor: string | null;
} {
  const custom = hasCustomLook(r);
  return {
    theme: bioThemeOf(r.theme),
    font: bioFontOf(r.font),
    custom,
    background: r.backgroundUrl || r.backgroundColor ? { url: r.backgroundUrl ?? null, color: r.backgroundColor ?? null, blur: blurOf(r.backgroundBlur) } : null,
    buttonColor: r.buttonColor ?? null,
    glowColor: r.glowColor ?? null,
    textColor: r.textColor ?? null,
    iconStyle: iconStyleOf(r.iconStyle),
    iconColor: r.iconColor ?? null,
  };
}

/** The text colour a theme uses when the owner hasn't picked one. Paper is the only light theme. */
export const themeInk = (theme: string | null | undefined) => (theme === "paper" ? "#0a0a0a" : "#ffffff");

/** The page colour text sits on, when droplr can know it. Null with an image behind: it can't tell. */
export function pageBase(l: { theme?: string | null; backgroundUrl?: string | null; backgroundColor?: string | null }): string | null {
  if (l.backgroundUrl) return null;
  if (l.backgroundColor) return l.backgroundColor;
  return l.theme === "paper" ? "#fafafa" : "#0b0b10";
}

/**
 * Plain-words warnings for the look editor. Empty for every theme as shipped. With an image behind the
 * page droplr can't measure the contrast, and says so rather than guessing.
 */
export function lookWarnings(l: Partial<PageLook>): string[] {
  if (!l.textColor) return [];
  const base = pageBase(l);
  if (!base) return ["Your page has an image behind it, so droplr can't measure your text colour against it. Check the preview."];
  return hexContrast(l.textColor, base) < 4.5 ? ["Your text will be hard to read on this background."] : [];
}

const rgbOf = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const hexContrast = (a: string, b: string) => contrastRatio(rgbOf(a), rgbOf(b));

/** The look columns off a stored row (Release or BioPage), for the public renderers. */
export const lookOf = (r: PageLook): PageLook => ({
  theme: r.theme, font: r.font, backgroundUrl: r.backgroundUrl, backgroundColor: r.backgroundColor, buttonColor: r.buttonColor,
  glowColor: r.glowColor, textColor: r.textColor, iconStyle: r.iconStyle, iconColor: r.iconColor,
});

/**
 * Light, dark or system for a release or download page. Free on every plan: it is the one look choice
 * a Free account has on these pages (bio pages have their whole look). NULL means dark, the signature
 * look. With a paid look set, the chosen theme decides instead (Paper is light, the rest dark).
 */
export const PAGE_MODES = ["dark", "light", "system"] as const;
export type PageMode = (typeof PAGE_MODES)[number];
export const PAGE_MODE_LABELS: Record<PageMode, string> = { dark: "Dark", light: "Light", system: "System" };
export const pageModeOf = (v: string | null | undefined): PageMode => (PAGE_MODES.includes(v as PageMode) ? (v as PageMode) : "dark");
