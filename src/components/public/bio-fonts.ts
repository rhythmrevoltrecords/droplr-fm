import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Instrument_Serif, Nunito } from "next/font/google";
import type { BioFontId } from "@/lib/bio-themes";

/**
 * The four bio page fonts. Separate from lib/bio-themes so that pure module stays
 * free of the font loader: this one is imported by the renderer and the admin form.
 *
 * Geist ships in the repo (the `geist` package), so Clean and Typewriter need no
 * network. The two Google families are self-hosted by next/font at build time and
 * carry preload: false — only the one an artist actually picked should cost a
 * request on their page.
 */

const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", display: "swap", preload: false, variable: "--font-bio-serif" });
const rounded = Nunito({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-bio-rounded" });

const CLASSES: Record<BioFontId, string> = {
  clean: GeistSans.className,
  serif: serif.className,
  rounded: rounded.className,
  typewriter: GeistMono.className,
};

/** Class to put on the page shell. Element-level font-family beats the inherited body font. */
export function bioFontClass(id: BioFontId): string {
  return CLASSES[id] ?? CLASSES.clean;
}
