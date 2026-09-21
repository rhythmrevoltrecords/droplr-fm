import { NOINDEX } from "@/lib/seo";

// Never indexed: this is the platform owner's own console. Middleware already sends a crawler
// to /login, but the header makes it true even if that guard is ever loosened.
export const metadata = { ...NOINDEX };

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return children;
}
