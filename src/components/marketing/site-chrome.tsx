import Link from "next/link";
import { Menu, X } from "lucide-react";
import { ctaCopy } from "@/lib/launch";
import { copyrightLine } from "@/lib/legal";
import { cn } from "@/lib/utils";
import { inter } from "./fonts";
import { Logo } from "./logo";
import { SectionLink } from "./section-link";

// Homepage sections jump without a "#product" in the URL (SectionLink).
const NAV: { href: string; label: string; section?: string }[] = [
  { href: "/", section: "product", label: "Product" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/learn", label: "Knowledge" },
  { href: "/blog", label: "News" },
  { href: "/pricing", label: "Pricing" },
  { href: "/demo/demo-track", label: "Demo" },
];

/**
 * `overlay`: the header floats over the page (fixed) instead of taking its own row (sticky). The
 * homepage uses it so its pinned showcase can fill the whole viewport, as in the approved design.
 */
export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const cta = ctaCopy();
  const navLink = "inline-flex h-10 items-center rounded-full px-3 transition-colors hover:bg-white/[0.06] hover:text-white";
  return (
    // Solid-ish background instead of backdrop-blur: no per-frame blur of everything scrolling underneath.
    <header className={cn("z-40 border-b border-white/[0.07] bg-[#0a090f]/[0.86]", overlay ? "fixed inset-x-0 top-0" : "sticky top-0")}>
      <div className="container flex h-16 items-center gap-3 md:gap-6">
        <Logo priority className="[&_img]:h-7" />
        <nav aria-label="Main" className="hidden gap-1 text-[15px] font-medium text-white/70 md:flex">
          {NAV.map((n) => (
            n.section
              ? <SectionLink key={n.label} section={n.section} className={navLink}>{n.label}</SectionLink>
              : <Link key={n.label} href={n.href} className={navLink}>{n.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="hidden h-10 items-center rounded-full px-3 text-[15px] font-medium text-white/70 transition-colors hover:text-white md:inline-flex">Log in</Link>
          <Link href={cta.primaryShort.href} className="inline-flex h-10 items-center rounded-full bg-white px-[18px] text-[15px] font-semibold text-[#161022] transition hover:bg-[#f1edff]">{cta.primaryShort.label}</Link>
          {/* No-JS mobile menu */}
          <details className="group relative md:hidden">
            <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg border border-white/10 text-muted-foreground transition-colors hover:text-foreground group-open:bg-white/10 group-open:text-foreground [&::-webkit-details-marker]:hidden">
              <Menu className="h-4 w-4 group-open:hidden" aria-hidden />
              <X className="hidden h-4 w-4 group-open:block" aria-hidden />
              <span className="sr-only">Menu</span>
            </summary>
            <nav aria-label="Mobile" className="absolute right-0 top-12 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-[#15121f] p-1.5 text-sm shadow-[0_24px_60px_-12px_rgba(0,0,0,.8)]">
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
  const col = "space-y-2.5";
  const head = "mb-3 text-xs font-medium uppercase tracking-[0.18em] text-white/50";
  const link = "block hover:text-foreground";
  return (
    <footer className="border-t border-white/[0.09] py-14 text-sm text-muted-foreground">
      <div className="container grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs">Made in Brisbane by Cody Morrison. droplr.fm isn&apos;t affiliated with Spotify, Apple or Deezer.</p>
        </div>
        <div className={col}>
          <p className={head}>Product</p>
          <SectionLink section="product" className={link}>Features</SectionLink>
          <Link href="/pricing" className={link}>Pricing</Link>
          <Link href="/demo/demo-track" className={link}>Demo</Link>
          <Link href="/roadmap" className={link}>Roadmap</Link>
        </div>
        <div className={col}>
          <p className={head}>Resources</p>
          <Link href="/tools/release-plan" className={link}>Free release plan</Link>
          <Link href="/learn" className={link}>Knowledge</Link>
          <Link href="/docs/custom-domain" className={link}>Custom domains</Link>
          <Link href="/docs/spotify-byo" className={link}>Spotify BYO app</Link>
        </div>
        <div className={col}>
          <p className={head}>Legal</p>
          <Link href="/legal/terms" className={link}>Terms</Link>
          <Link href="/legal/privacy" className={link}>Privacy</Link>
          <Link href="/legal" className={link}>All legal</Link>
        </div>
      </div>
      <p className="container mt-10 text-xs text-muted-foreground">
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

/**
 * Every marketing page. Inter is set here (not in the root layout) so the dashboard keeps Geist.
 * `overlay` floats the header over the page; `glow={false}` drops the page-wide light for a page
 * that paints its own (the homepage).
 */
export function MarketingShell({ children, overlay = false, glow = true }: { children: React.ReactNode; overlay?: boolean; glow?: boolean }) {
  return (
    <div className={cn("mk-shell relative isolate min-h-dvh overflow-x-clip bg-[#0a090f] font-sans", inter.variable)} style={{ ["--font-sans" as string]: "var(--font-inter)" }}>
      {glow && <div aria-hidden className="pointer-events-none fixed inset-0 -z-10" style={{ background: PAGE_GLOW }} />}
      <SiteHeader overlay={overlay} />
      {children}
      <SiteFooter />
    </div>
  );
}
