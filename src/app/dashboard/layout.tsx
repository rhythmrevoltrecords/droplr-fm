import { AppShell } from "@/components/admin/app-shell";
import { VerifyEmailBanner } from "@/components/admin/verify-email-banner";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
// Signed-in pages: a plain tab title instead of the marketing tagline, and never indexed.
export const metadata = { title: { default: "Dashboard · droplr.fm", template: "%s · droplr.fm" }, robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("artist");
  return <AppShell user={user} nav={[{ href: "/dashboard", label: "My releases" }, { href: "/dashboard/profile", label: "Profile" }, { href: "/dashboard/account", label: "Account" }]} accountHref="/dashboard/account">{!user.emailVerifiedAt && <VerifyEmailBanner email={user.email} />}{children}</AppShell>;
}
