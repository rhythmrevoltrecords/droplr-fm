import { AppShell } from "@/components/admin/app-shell";
import { VerifyEmailBanner } from "@/components/admin/verify-email-banner";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
// Signed-in pages: a plain tab title instead of the marketing tagline, and never indexed.
export const metadata = { title: { default: "Dashboard · droplr.fm", template: "%s · droplr.fm" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("label");
  const artist = user.organization.kind === "artist";
  const feedbackUnread = (await prisma.feedbackThread.count({ where: { userId: user.id, unreadByUser: true } })) > 0;
  return (
    <AppShell
      user={user}
      billingHref="/admin/settings/billing"
      accountHref="/admin/settings/account"
      feedbackHref="/admin/feedback"
      feedbackUnread={feedbackUnread}
      nav={[
        { href: "/admin", label: "Releases" },
        { href: "/admin/fans", label: "Fans" },
        { href: "/admin/bio", label: "Bio links" },
        // An artist account has one profile (its own); a label manages a roster.
        { href: "/admin/artists", label: artist ? "Profile" : "Roster" },
        { href: "/admin/settings", label: "Settings" },
        { href: "/admin/settings/integrations", label: "Integrations" },
        { href: "/admin/settings/billing", label: "Billing" },
      ]}
    >
      {!user.emailVerifiedAt && <VerifyEmailBanner email={user.email} />}
      {children}
    </AppShell>
  );
}
