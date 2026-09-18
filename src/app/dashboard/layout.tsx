import { AppShell } from "@/components/admin/app-shell";
import { tourSteps } from "@/lib/tour";
import { LegalUpdateNotice } from "@/components/admin/legal-update-notice";
import { VerifyEmailBanner } from "@/components/admin/verify-email-banner";
import { requireUser } from "@/lib/auth";
import { LEGAL, needsReaccept, updatesSince } from "@/lib/legal";
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
  return <AppShell user={user} nav={[{ href: "/dashboard", label: "My releases", tour: "nav-releases" }, { href: "/dashboard/profile", label: "Profile", tour: "nav-profile" }, { href: "/dashboard/learn", label: "Knowledge", tour: "nav-knowledge" }, { href: "/dashboard/templates", label: "Templates", tour: "nav-templates" }, { href: "/dashboard/account", label: "Account" }]} accountHref="/dashboard/account" feedbackHref="/dashboard/feedback" feedbackUnread={feedbackUnread} tour={user.tourDoneAt ? undefined : tourSteps("artistLogin")}>{needsReaccept(user.termsVersion) && <LegalUpdateNotice updates={updatesSince(user.termsVersion)} updated={LEGAL.updated} />}{!user.emailVerifiedAt && <VerifyEmailBanner email={user.email} />}{children}</AppShell>;
}
