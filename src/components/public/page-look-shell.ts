import { bioSkinClass, bioThemeHasGlow, bioThemeIsLight } from "@/lib/bio-themes";
import { resolveLook, type PageLook } from "@/lib/page-look";
import type { PublicTheme } from "./artwork-shell";
import { bioFontClass } from "./bio-fonts";

/**
 * ArtworkPageShell props for a release, pre-save, smart link or download page's look.
 *
 * Kept out of lib/page-look because the font classes come from next/font. A page with no look set
 * returns only the theme and glow it always had, with no skin class at all, so every page that
 * existed before looks did renders byte-for-byte the same.
 *
 * Same rules as the bio page: Paper is the light shell, unless the label's own public theme already
 * says otherwise; Mono switches the glow off.
 */
export function lookShell(look: Partial<PageLook> | null | undefined, theme: PublicTheme, glowOn: boolean) {
  const l = resolveLook(look ?? {});
  if (!l.custom) return { theme, glow: glowOn };
  return {
    theme: bioThemeIsLight(l.theme) && theme === "dark" ? ("light" as const) : theme,
    skin: `${bioSkinClass(l.theme)} ${bioFontClass(l.font)}`,
    glow: glowOn && bioThemeHasGlow(l.theme),
    background: l.background,
    buttonColor: l.buttonColor,
  };
}
