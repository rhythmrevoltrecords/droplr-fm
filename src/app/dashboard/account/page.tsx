import { AccountPage } from "@/components/admin/account-page";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account" };

export default async function ArtistAccountPage() {
  const user = await requireUser("artist");
  return <AccountPage user={user} />;
}
