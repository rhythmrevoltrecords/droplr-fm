import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:8888"),
  title: { default: "droplr.fm — Pre-saves & smart links for labels", template: "%s · droplr.fm" },
  description: "Smart links, email pre-saves with release-day emails, and bring-your-own-app Spotify saves. Built for independent labels.",
  icons: {
    icon: [{ url: "/logo/icon.png", type: "image/png" }],
    shortcut: "/logo/icon.png",
    apple: [{ url: "/logo/icon.png", type: "image/png" }],
  },
};

export const viewport: Viewport = { themeColor: "#09090b", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable}`} style={{ ["--font-sans" as string]: "var(--font-geist-sans)" }}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
