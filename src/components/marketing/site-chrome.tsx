import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ctaCopy } from "@/lib/launch";
import { copyrightLine } from "@/lib/legal";
import { Logo } from "./logo";
import { SectionLink } from "./section-link";

// Homepage sections jump without a "#product" in the URL (SectionLink).
const NAV: { href: string; label: string; section?: string }[] = [
  { href: "/", section: "product", label: "Product" },
  { href: "/", section: "roadmap", label: "Roadmap" },
  { href: "/pricing", label: "Pricing" },
  { href: "/demo/demo-track", label: "Demo" },
];

export function SiteHeader() {
  const cta = ctaCopy();
  return (
    // Solid-ish background instead of backdrop-blur: no per-frame blur of everything scrolling underneath.
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0c0a14]/90">
      <div className="container flex h-14 items-center gap-3 md:gap-6">
        <Logo priority />
        <nav aria-label="Main" className="hidden gap-5 text-sm text-muted-foreground md:flex">
          {NAV.map((n) => (
            n.section
              ? <SectionLink key={n.label} section={n.section} className="transition-colors hover:text-foreground">{n.label}</SectionLink>
              : <Link key={n.label} href={n.href} className="transition-colors hover:text-foreground">{n.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex"><Link href="/login">Log in</Link></Button>
          <Button asChild size="sm" variant="white"><Link href={cta.primaryShort.href}>{cta.primaryShort.label}</Link></Button>
          {/* No-JS mobile menu */}
          <details className="group relative md:hidden">
            <summary className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-lg border border-white/10 text-muted-foreground transition-colors hover:text-foreground group-open:bg-white/10 group-open:text-foreground [&::-webkit-details-marker]:hidden">
              <Menu className="h-4 w-4 group-open:hidden" aria-hidden />
              <X className="hidden h-4 w-4 group-open:block" aria-hidden />
              <span className="sr-only">Menu</span>
            </summary>
            <nav aria-label="Mobile" className="absolute right-0 top-10 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-[#15121f] p-1.5 text-sm shadow-[0_24px_60px_-12px_rgba(0,0,0,.8)]">
              {NAV.map((n) => (
                n.section
                  ? <SectionLink key={n.label} section={n.section} className="block rounded-lg px-3 py-2.5 text-muted-foreground hover:bg-white/5 hover:text-foreground">{n.label}</SectionLink>
                  : <Link key={n.label} href={n.href} className="block rounded-lg px-3 py-2.5 text-muted-foreground hover:bg-white/5 hover:text-foreground">{n.label}</Link>
              ))}
              <div className="my-1.5 h-px bg-white/10" />
              <Link href="/docs/spotify-byo" className="block rounded-lg px-3 py-2.5 text-muted-foreground hover:bg-white/5 hover:text-foreground">Docs</Link>
              <Link href="/login" className="block rounded-lg px-3 py-2.5 text-muted-foreground hover:bg-white/5 hover:text-foreground">Log in</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 py-10 text-sm text-muted-foreground">
      <div className="container flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <Logo />
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <SectionLink section="product" className="hover:text-foreground">Product</SectionLink>
          <SectionLink section="roadmap" className="hover:text-foreground">Roadmap</SectionLink>
          <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link href="/demo/demo-track" className="hover:text-foreground">Demo</Link>
          <Link href="/docs/custom-domain" className="hover:text-foreground">Custom domains</Link>
          <Link href="/docs/spotify-byo" className="hover:text-foreground">Spotify BYO app</Link>
          <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/legal" className="hover:text-foreground">Legal</Link>
        </div>
        <p>Made in Brisbane. droplr.fm isn&apos;t affiliated with Spotify, Apple or Deezer.</p>
      </div>
      <p className="container mt-6 text-xs text-muted-foreground/70">
        {copyrightLine()} Platform names and logos are trade marks of their owners. <Link href="/legal/copyright" className="underline">Copyright &amp; trade marks</Link>
      </p>
    </footer>
  );
}

/** Page-wide violet light, painted with plain gradients (no blur filter) so it costs nothing at first paint. */
const PAGE_GLOW = [
  "radial-gradient(70% 45% at 50% -5%, rgba(139,92,246,.22) 0%, rgba(139,92,246,.08) 45%, transparent 75%)",
  "radial-gradient(55% 45% at 100% 105%, rgba(139,92,246,.16) 0%, transparent 70%)",
  "radial-gradient(40% 35% at 0% 90%, rgba(217,70,239,.07) 0%, transparent 70%)",
].join(", ");

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh overflow-x-clip bg-[#0c0a14]">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10" style={{ background: PAGE_GLOW }} />
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
