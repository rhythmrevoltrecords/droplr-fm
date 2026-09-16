import Link from "next/link";
import { Logo } from "@/components/marketing/logo";
import { Badge } from "@/components/ui/badge";
import { planOf } from "@/lib/plans";
import { cn } from "@/lib/utils";

export type ShellOrg = { name: string; plan: string; logoUrl?: string | null; themePreference?: string | null; accentColor?: string | null };

export function themeClass(pref: string | null | undefined) {
  return pref === "light" ? "theme-light" : pref === "system" ? "theme-system" : "theme-dark";
}

/** Admin + artist dashboard chrome. Theme follows Organization.themePreference (dark by default). */
export function AppShell({ user, nav, children }: { user: { email: string; role: string; artistName: string | null; organization: ShellOrg }; nav: { href: string; label: string }[]; children: React.ReactNode }) {
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
              <span className="truncate">{org.name}</span>
            </span>
            <Badge variant="secondary">{planOf(org.plan).name}</Badge>
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
    </div>
  );
}
