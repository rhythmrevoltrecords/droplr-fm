import Link from "next/link";
import { Logo } from "@/components/marketing/logo";
import { Badge } from "@/components/ui/badge";
import { planOf } from "@/lib/plans";

export function AppShell({ user, nav, children }: { user: { email: string; role: string; artistName: string | null; organization: { name: string; plan: string } }; nav: { href: string; label: string }[]; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="container flex h-14 items-center gap-4">
          <Logo href={nav[0]?.href ?? "/"} priority />
          <nav className="hidden items-center gap-1 text-sm md:flex">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">{n.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{user.organization.name}</span>
            <Badge variant="secondary">{planOf(user.organization.plan).name}</Badge>
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
