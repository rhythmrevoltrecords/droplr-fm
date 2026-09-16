import { AccountPage } from "@/components/admin/account-page";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account" };

export default async function AdminAccountPage() {
  const user = await requireUser("label");
  return <AccountPage user={user} back={{ href: "/admin/settings", label: "Settings" }} />;
}
