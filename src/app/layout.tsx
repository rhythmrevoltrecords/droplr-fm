import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { signupsOpen } from "@/lib/launch";

const TITLE = "droplr.fm — Run your label's releases from one place";
const DESCRIPTION = "Smart links, email pre-saves with a release-day email, and a label roster with artist logins. Built for independent labels.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:8888"),
  title: { default: TITLE, template: "%s · droplr.fm" },
  description: DESCRIPTION,
  // Images come from app/opengraph-image.tsx and app/twitter-image.tsx; favicons from app/icon.png and app/apple-icon.png.
  openGraph: { type: "website", siteName: "droplr.fm", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  // Pre-launch: keep search engines out until SIGNUPS_OPEN=true.
  ...(signupsOpen() ? {} : { robots: { index: false, follow: false } }),
};

export const viewport: Viewport = { themeColor: "#09090b", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable}`} style={{ ["--font-sans" as string]: "var(--font-geist-sans)" }}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
