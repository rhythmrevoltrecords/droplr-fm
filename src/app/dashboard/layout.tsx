import { AppShell } from "@/components/admin/app-shell";
import { VerifyEmailBanner } from "@/components/admin/verify-email-banner";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
// Signed-in pages: a plain tab title instead of the marketing tagline, and never indexed.
export const metadata = {
  title: { default: "Dashboard · droplr.fm", template: "%s · droplr.fm" },
  robots: { index: false, follow: false },
  // Installable as an app (Home Screen / Android install) for push notifications.
  manifest: "/app/manifest.webmanifest",
  appleWebApp: { capable: true, title: "droplr", statusBarStyle: "black-translucent" as const },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("artist");
  const feedbackUnread = (await prisma.feedbackThread.count({ where: { userId: user.id, unreadByUser: true } })) > 0;
  return <AppShell user={user} nav={[{ href: "/dashboard", label: "My releases" }, { href: "/dashboard/profile", label: "Profile" }, { href: "/dashboard/learn", label: "Knowledge" }, { href: "/dashboard/account", label: "Account" }]} accountHref="/dashboard/account" feedbackHref="/dashboard/feedback" feedbackUnread={feedbackUnread}>{!user.emailVerifiedAt && <VerifyEmailBanner email={user.email} />}{children}</AppShell>;
}
