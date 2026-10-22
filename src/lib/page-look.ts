/**
 * The look of a release, pre-save, smart link or download page: theme, font, button colour and
 * background. Pure module (zod only), shared by the Look tab, its API route and the public pages.
 *
 * The values are the bio page's, on purpose. One set of four themes and four fonts, contrast-checked
 * once in scripts/test-bio-theme.ts, and one skin stylesheet in globals.css. A release page that
 * invented its own options would need all of that again and would drift from the bio page.
 */
import { z } from "zod";
import { BIO_FONT_IDS, BIO_THEME_IDS, bioFontOf, bioThemeOf, type BioFontId, type BioThemeId } from "./bio-themes";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const blank = z.literal("");

export const pageLookSchema = z
  .object({
    theme: z.enum(BIO_THEME_IDS as unknown as [string, ...string[]]).nullable().optional().or(blank),
    font: z.enum(BIO_FONT_IDS as unknown as [string, ...string[]]).nullable().optional().or(blank),
    backgroundUrl: z.string().url().max(500).nullable().optional().or(blank),
    backgroundColor: hex.nullable().optional().or(blank),
    buttonColor: hex.nullable().optional().or(blank),
  })
  .strict();

export type PageLookInput = z.infer<typeof pageLookSchema>;

export type PageLook = {
  theme: string | null;
  font: string | null;
  backgroundUrl: string | null;
  backgroundColor: string | null;
  buttonColor: string | null;
};

export const LOOK_FIELDS = ["theme", "font", "backgroundUrl", "backgroundColor", "buttonColor"] as const;

/** The columns to write. Empty string and null both mean "back to the default", stored as NULL. */
export function lookUpdate(d: PageLookInput): Partial<PageLook> {
  const out: Partial<PageLook> = {};
  for (const k of LOOK_FIELDS) if (d[k] !== undefined) out[k] = d[k] || null;
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
  background: { url: string | null; color: string | null } | null;
  buttonColor: string | null;
} {
  const custom = hasCustomLook(r);
  return {
    theme: bioThemeOf(r.theme),
    font: bioFontOf(r.font),
    custom,
    background: r.backgroundUrl || r.backgroundColor ? { url: r.backgroundUrl ?? null, color: r.backgroundColor ?? null } : null,
    buttonColor: r.buttonColor ?? null,
  };
}
