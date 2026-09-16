import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signupsOpen } from "@/lib/launch";
import { copyrightLine } from "@/lib/legal";
import { Logo } from "./logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0c0a14]/50 backdrop-blur-xl">
      <div className="container flex h-14 items-center gap-6">
        <Logo priority />
        <nav className="hidden gap-5 text-sm text-muted-foreground md:flex">
          <Link href="/#features" className="hover:text-foreground">Features</Link>
          <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link href="/demo/demo-track" className="hover:text-foreground">Demo</Link>
          <Link href="/docs/spotify-byo" className="hover:text-foreground">Docs</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link href="/login">Log in</Link></Button>
          <Button asChild size="sm" variant="white"><Link href="/signup">{signupsOpen() ? "Start free" : "Join waitlist"}</Link></Button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 py-10 text-sm text-muted-foreground">
      <div className="container flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Logo />
        <div className="flex flex-wrap gap-5">
          <Link href="/pricing">Pricing</Link>
          <Link href="/docs/custom-domain">Custom domains</Link>
          <Link href="/docs/spotify-byo">Spotify BYO app</Link>
          <Link href="/demo/demo-track">Demo</Link>
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal">Legal</Link>
        </div>
        <p>Made in Brisbane. droplr.fm isn&apos;t affiliated with Spotify, Apple, Deezer or Feature.fm.</p>
      </div>
      <p className="container mt-6 text-xs text-muted-foreground/70">
        {copyrightLine()} Platform names and logos are trade marks of their owners. <Link href="/legal/copyright" className="underline">Copyright &amp; trade marks</Link>
      </p>
    </footer>
  );
}

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh bg-[#0c0a14]">
      {/* Page-wide glow: fixed behind everything, blurred violet light */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-18%] h-[75vh] w-[110vw] -translate-x-1/2 rounded-full bg-violet-500/25 blur-[140px]" />
        <div className="absolute bottom-[-25%] right-[-15%] h-[60vh] w-[70vw] rounded-full bg-violet-500/25 blur-[160px]" />
        <div className="absolute bottom-[10%] left-[-20%] h-[45vh] w-[50vw] rounded-full bg-fuchsia-500/10 blur-[140px]" />
      </div>
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
