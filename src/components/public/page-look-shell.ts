import { bioSkinClass, bioThemeHasGlow, bioThemeIsLight } from "@/lib/bio-themes";
import { resolveLook, type IconStyle, type PageLook } from "@/lib/page-look";
import type { PublicTheme } from "./artwork-shell";
import { bioFontClass } from "./bio-fonts";

/**
 * Everything a public page needs from its look: the ArtworkPageShell props, the glow colour for the
 * shell and the hero, and how to draw the social icon row.
 *
 * Kept out of lib/page-look because the font classes come from next/font. A page with no look set
 * gets back only the theme and glow it always had, with no skin class, so every page that existed
 * before looks did renders the same.
 *
 * Same rules as the bio page: Paper is the light shell unless the label's own public theme already
 * says otherwise; Mono switches the glow off. The page's glow colour wins over the account's.
 */
export function lookShell(look: Partial<PageLook> | null | undefined, theme: PublicTheme, glowOn: boolean, accountGlow: string | null | undefined) {
  const l = resolveLook(look ?? {});
  const glowColor = l.glowColor ?? accountGlow ?? null;
  if (!l.custom) {
    return { shell: { theme, glow: glowOn, glowColor }, glowColor, icons: { iconStyle: "plain" as IconStyle, color: null, light: theme === "light" } };
  }
  // A chosen look decides light or dark by its theme (Paper is the light one); the page's mode is
  // for pages on droplr's default look.
  const shellTheme: PublicTheme = bioThemeIsLight(l.theme) ? "light" : "dark";
  return {
    shell: {
      theme: shellTheme,
      skin: `${bioSkinClass(l.theme)} ${bioFontClass(l.font)}`,
      glow: glowOn && bioThemeHasGlow(l.theme),
      glowColor,
      background: l.background,
      buttonColor: l.buttonColor,
      textColor: l.textColor,
    },
    glowColor,
    // Outline and solid start in the text colour, as the editor promises.
    icons: { iconStyle: l.iconStyle, color: l.iconColor ?? l.textColor, light: shellTheme === "light" },
  };
}
