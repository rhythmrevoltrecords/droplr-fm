import { redirect } from "next/navigation";
import { AuthShell } from "@/components/marketing/auth-shell";
import { VerifyEmailGate } from "@/components/admin/verify-email-gate";
import { isLabelRole, requireUser } from "@/lib/auth";

export const metadata = { title: "Confirm your email" };
export const dynamic = "force-dynamic";

/**
 * Where an account waits until it has confirmed its address.
 *
 * Signups are public, so "unconfirmed" now includes anyone at all — and an account that can reach
 * the dashboard can publish a page on droplr.fm. Holding the whole app behind the link is the
 * cheapest thing that stops droplr's own domain being used by someone who never had to prove
 * they could receive mail. It also means the first screen after signing up is one instruction
 * rather than a dashboard with a warning stuck to the top of it.
 */
export default async function VerifyEmailPage() {
  const user = await requireUser();
  // Already confirmed: nothing to do here. Send them where they were going.
  if (user.emailVerifiedAt) redirect(isLabelRole(user.role) ? "/admin" : "/dashboard");
  return (
    <AuthShell title="Confirm your email" subtitle="It keeps your links, your fans and your account yours.">
      <VerifyEmailGate email={user.email} />
    </AuthShell>
  );
}
