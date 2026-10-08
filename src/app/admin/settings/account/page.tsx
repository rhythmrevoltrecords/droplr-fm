import Link from "next/link";
import { AccountPage } from "@/components/admin/account-page";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account" };

export default async function AdminAccountPage() {
  const user = await requireUser("label");
  return (
    <>
      <AccountPage user={user} back={{ href: "/admin/settings", label: "Settings" }} />
      {/* Owner only, and findable rather than hidden: a close-account link you have to email for is
          the same dark pattern as a five-step cancellation, just slower. */}
      {user.role === "owner" && (
        <p className="mt-10 text-sm text-muted-foreground">
          <Link href="/admin/settings/account/close" className="underline hover:text-foreground">Close your account</Link>
          {" \u2014 "}take your fan list and delete everything. If you only want to stop paying,{" "}
          <Link href="/admin/settings/billing" className="underline hover:text-foreground">cancel in Billing</Link> instead and keep your pages.
        </p>
      )}
    </>
  );
}
