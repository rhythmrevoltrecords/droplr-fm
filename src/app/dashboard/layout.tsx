import { AppShell } from "@/components/admin/app-shell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("artist");
  return <AppShell user={user} nav={[{ href: "/dashboard", label: "My releases" }, { href: "/dashboard/account", label: "Account" }]} accountHref="/dashboard/account">{children}</AppShell>;
}
