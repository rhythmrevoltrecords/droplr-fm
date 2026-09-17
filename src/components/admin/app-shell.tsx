import { Sparkles } from "lucide-react";
import Link from "next/link";
import { DashboardGlow } from "@/components/admin/dashboard-glow";
import { DesktopNav, MobileNav } from "@/components/admin/nav-links";
import { FeedbackButton } from "@/components/feedback/feedback-forms";
import { Logo } from "@/components/marketing/logo";
import { Badge } from "@/components/ui/badge";
import { copyrightLine } from "@/lib/legal";
import { planOf } from "@/lib/plans";
import { cn } from "@/lib/utils";

export type ShellOrg = { name: string; plan: string; logoUrl?: string | null; themePreference?: string | null; accentColor?: string | null; dashboardGlow?: boolean | null };

export function themeClass(pref: string | null | undefined) {
  return pref === "light" ? "theme-light" : pref === "system" ? "theme-system" : "theme-dark";
}

/** Admin + artist dashboard chrome. Theme follows Organization.themePreference (dark by default). */
export function AppShell({ user, nav, children, billingHref, accountHref, feedbackHref, feedbackUnread = false }: { user: { email: string; role: string; artistName: string | null; organization: ShellOrg }; nav: { href: string; label: string }[]; children: React.ReactNode; /** Label admins only: plan badge links here, and Free shows an Upgrade button. */ billingHref?: string; /** Account page (password, sessions); the name in the header links here. */ accountHref?: string; /** Feedback page; the dot shows when the droplr.fm team has replied. */ feedbackHref?: string; feedbackUnread?: boolean }) {
  const org = user.organization;
  return (
    <div className={cn(themeClass(org.themePreference), "relative isolate min-h-dvh bg-background text-foreground", org.dashboardGlow !== false && "glow-on")}>
      {org.dashboardGlow !== false && <DashboardGlow accent={org.accentColor} />}
      <header
        // Home Screen app (status bar is translucent): keep the header below the clock / Dynamic Island.
        className="sticky top-0 z-30 border-b bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur"
        style={org.accentColor ? { borderTop: `2px solid ${org.accentColor}` } : undefined}
      >
        <div className="container flex h-14 items-center gap-4">
          <Logo href={nav[0]?.href ?? "/"} priority />
          <DesktopNav nav={nav} />
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
            {feedbackHref && <FeedbackButton href={feedbackHref} unread={feedbackUnread} />}
            <form method="post" action="/api/auth/logout"><button className="text-muted-foreground hover:text-foreground">Log out</button></form>
          </div>
        </div>
        <MobileNav nav={nav} />
      </header>
      <main className="container relative py-6 sm:py-8">{children}</main>
      <footer className="container relative flex flex-col gap-2 border-t pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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
