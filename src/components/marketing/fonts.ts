import { Inter } from "next/font/google";

/**
 * The thumbnail brand: Inter, Black for the uppercase headlines. Scoped to MarketingShell on
 * purpose. The root layout's Geist stays the font of the dashboard, auth screens and fan pages,
 * which have their own sizing tuned to it.
 */
export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-inter",
});
