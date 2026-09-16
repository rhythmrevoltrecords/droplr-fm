import { AppShell } from "@/components/admin/app-shell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("label");
  return (
    <AppShell
      user={user}
      billingHref="/admin/settings/billing"
      nav={[
        { href: "/admin", label: "Releases" },
        { href: "/admin/bio", label: "Bio links" },
        { href: "/admin/artists", label: "Roster" },
        { href: "/admin/settings", label: "Settings" },
        { href: "/admin/settings/integrations", label: "Integrations" },
        { href: "/admin/settings/billing", label: "Billing" },
      ]}
    >
      {children}
    </AppShell>
  );
}
