import { AppShell } from "@/components/admin/app-shell";
import { VerifyEmailBanner } from "@/components/admin/verify-email-banner";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("label");
  return (
    <AppShell
      user={user}
      billingHref="/admin/settings/billing"
      accountHref="/admin/settings/account"
      nav={[
        { href: "/admin", label: "Releases" },
        { href: "/admin/bio", label: "Bio links" },
        { href: "/admin/artists", label: "Roster" },
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
