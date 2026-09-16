import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/marketing/logo";
import { Badge } from "@/components/ui/badge";
import { copyrightLine } from "@/lib/legal";
import { planOf } from "@/lib/plans";
import { cn } from "@/lib/utils";

export type ShellOrg = { name: string; plan: string; logoUrl?: string | null; themePreference?: string | null; accentColor?: string | null };

export function themeClass(pref: string | null | undefined) {
  return pref === "light" ? "theme-light" : pref === "system" ? "theme-system" : "theme-dark";
}

/** Admin + artist dashboard chrome. Theme follows Organization.themePreference (dark by default). */
export function AppShell({ user, nav, children, billingHref, accountHref }: { user: { email: string; role: string; artistName: string | null; organization: ShellOrg }; nav: { href: string; label: string }[]; children: React.ReactNode; /** Label admins only: plan badge links here, and Free shows an Upgrade button. */ billingHref?: string; /** Account page (password, sessions); the name in the header links here. */ accountHref?: string }) {
  const org = user.organization;
  return (
    <div className={cn(themeClass(org.themePreference), "min-h-dvh bg-background text-foreground")}>
      <header
        className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur"
        style={org.accentColor ? { borderTop: `2px solid ${org.accentColor}` } : undefined}
      >
        <div className="container flex h-14 items-center gap-4">
          <Logo href={nav[0]?.href ?? "/"} priority />
          <nav className="hidden items-center gap-1 text-sm md:flex">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">{n.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-3 text-sm">
            <span className="hidden min-w-0 items-center gap-2 text-muted-foreground sm:flex">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {org.logoUrl && <img src={org.logoUrl} alt="" className="h-6 w-6 shrink-0 rounded object-cover ring-1 ring-border" />}
              {accountHref ? (
                <Link href={accountHref} className="truncate hover:text-foreground" title={`${user.email} · Account`}>{org.name}</Link>
              ) : (
                <span className="truncate">{org.name}</span>
              )}
            </span>
            {billingHref && planOf(org.plan).name === "Free" ? (
              <Link
                href={billingHref}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-violet-600 px-3 text-xs font-semibold text-white shadow-[0_0_24px_-6px_rgba(124,58,237,0.8)] transition hover:bg-violet-500"
              >
                <Sparkles className="h-3.5 w-3.5" /> Upgrade
              </Link>
            ) : billingHref ? (
              <Link href={billingHref} title="Plan & billing"><Badge variant="secondary" className="hover:bg-secondary/70">{planOf(org.plan).name}</Badge></Link>
            ) : (
              <Badge variant="secondary">{planOf(org.plan).name}</Badge>
            )}
            <form method="post" action="/api/auth/logout"><button className="text-muted-foreground hover:text-foreground">Log out</button></form>
          </div>
        </div>
        <nav className="container flex gap-1 overflow-x-auto pb-2 text-sm md:hidden">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="shrink-0 rounded-md bg-secondary/60 px-3 py-1.5">{n.label}</Link>
          ))}
        </nav>
      </header>
      <main className="container py-8">{children}</main>
      <footer className="container flex flex-col gap-2 border-t py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>{copyrightLine()}</span>
        <nav aria-label="Legal" className="flex flex-wrap gap-4">
          <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/legal/data-processing" className="hover:text-foreground">Data processing</Link>
          <a href="mailto:support@droplr.fm" className="hover:text-foreground">Support</a>
        </nav>
      </footer>
    </div>
  );
}
