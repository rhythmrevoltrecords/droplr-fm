import Link from "next/link";
import { Logo } from "@/components/marketing/logo";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";

/** Owner console chrome: Accounts / Access / Feedback (unread count) / Referrals / Emails. */
export async function PlatformChrome({ email, active, children }: { email: string; active: "accounts" | "access" | "feedback" | "referrals" | "emails"; children: React.ReactNode }) {
  const [unread, toApply] = await Promise.all([
    prisma.feedbackThread.count({ where: { unreadByTeam: true } }),
    prisma.referral.count({ where: { status: "earned", note: { not: null } } }),
  ]);
  const tabs = [
    { key: "accounts", href: "/platform", label: "Accounts", count: 0 },
    { key: "access", href: "/platform/access", label: "Access", count: 0 },
    { key: "feedback", href: "/platform/feedback", label: "Feedback", count: unread },
    { key: "referrals", href: "/platform/referrals", label: "Referrals", count: toApply },
    { key: "emails", href: "/platform/emails", label: "Emails", count: 0 },
  ] as const;
  return (
    <div className="theme-dark min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="container flex h-14 items-center gap-4">
          <Logo href="/platform" />
          <Badge variant="warning">Platform owner</Badge>
          <nav className="hidden items-center gap-1 text-sm sm:flex">
            {tabs.map((t) => (
              <Link key={t.key} href={t.href} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5", active === t.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {t.label}
                {t.count > 0 && <span className="rounded-full bg-violet-600 px-1.5 text-[11px] font-semibold leading-5 text-white">{t.count}</span>}
              </Link>
            ))}
          </nav>
          <span className="ml-auto truncate text-sm text-muted-foreground">{email} · <Link href="/admin" className="underline">Back to my account</Link></span>
        </div>
        <nav className="container flex gap-1 overflow-x-auto pb-2 text-sm sm:hidden">
          {tabs.map((t) => (
            <Link key={t.key} href={t.href} className={cn("shrink-0 rounded-md px-3 py-1.5", active === t.key ? "bg-secondary" : "bg-secondary/40 text-muted-foreground")}>{t.label}{t.count > 0 ? ` (${t.count})` : ""}</Link>
          ))}
        </nav>
      </header>
      <main className="container space-y-6 py-8">{children}</main>
    </div>
  );
}
