import Link from "next/link";
import { Logo } from "@/components/marketing/logo";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";

/** Owner console chrome: Accounts / Numbers / Access / Feedback (unread count) / Referrals / Emails. */
export async function PlatformChrome({ email, active, children }: { email: string; active: "accounts" | "stats" | "access" | "feedback" | "referrals" | "emails"; children: React.ReactNode }) {
  const [unread, toApply] = await Promise.all([
    prisma.feedbackThread.count({ where: { unreadByTeam: true } }),
    prisma.referral.count({ where: { status: "earned", note: { not: null } } }),
  ]);
  const tabs = [
    { key: "accounts", href: "/platform", label: "Accounts", count: 0 },
    { key: "stats", href: "/platform/stats", label: "Numbers", count: 0 },
    { key: "access", href: "/platform/access", label: "Access", count: 0 },
    { key: "feedback", href: "/platform/feedback", label: "Feedback", count: unread },
    { key: "referrals", href: "/platform/referrals", label: "Referrals", count: toApply },
    { key: "emails", href: "/platform/emails", label: "Emails", count: 0 },
  ] as const;
  return (
    <div className="theme-dark min-h-dvh bg-background text-foreground">
      {/* A faint violet wash at the top, so the console reads as droplr's without competing with the data. */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(139,92,246,0.14),transparent)]" />
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-background/75 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="container flex h-14 items-center gap-3">
          <Logo href="/platform" />
          <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-violet-200">Owner</span>
          <nav aria-label="Console" className="ml-2 hidden items-center gap-0.5 rounded-full border border-white/[0.07] bg-white/[0.03] p-1 text-sm md:flex">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                aria-current={active === t.key ? "page" : undefined}
                className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition", active === t.key ? "bg-white/[0.1] text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {t.label}
                {t.count > 0 && <span className="rounded-full bg-violet-600 px-1.5 text-[11px] font-semibold leading-5 text-white">{t.count}</span>}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-3 text-sm">
            <span className="hidden truncate text-muted-foreground lg:inline">{email}</span>
            <Link href="/admin" className="shrink-0 rounded-full border border-white/[0.1] px-3 py-1 text-muted-foreground transition hover:border-white/20 hover:text-foreground">My account</Link>
          </div>
        </div>
        <nav aria-label="Console" className="container flex gap-1 overflow-x-auto pb-2 text-sm md:hidden">
          {tabs.map((t) => (
            <Link key={t.key} href={t.href} aria-current={active === t.key ? "page" : undefined} className={cn("shrink-0 rounded-full px-3 py-1", active === t.key ? "bg-white/[0.1] text-foreground" : "bg-white/[0.03] text-muted-foreground")}>
              {t.label}{t.count > 0 ? ` · ${t.count}` : ""}
            </Link>
          ))}
        </nav>
      </header>
      <main className="container relative z-10 space-y-8 pb-[max(3rem,env(safe-area-inset-bottom))] pt-8">{children}</main>
    </div>
  );
}
