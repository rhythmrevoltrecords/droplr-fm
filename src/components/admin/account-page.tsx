import Link from "next/link";
import { ChangePasswordForm, SignOutEverywhereButton } from "@/components/admin/account-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MIN_PASSWORD } from "@/lib/auth";
import { CONTACT } from "@/lib/legal";
import { formatInTz } from "@/lib/time";

type AccountUser = { email: string; role: string; artistName: string | null; createdAt: Date; termsAcceptedAt: Date | null; organization: { name: string; timezone: string } };

/** Shared by /admin/settings/account (label team) and /dashboard/account (artists). */
export function AccountPage({ user, back }: { user: AccountUser; back?: { href: string; label: string } }) {
  const tz = user.organization.timezone;
  return (
    <div className="space-y-6">
      <div>
        {back && <p className="text-sm text-muted-foreground"><Link href={back.href} className="hover:underline">{back.label}</Link> / Account</p>}
        <h1 className="text-2xl font-semibold">Your account</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>Login details</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[140px_1fr]">
            <dt className="text-muted-foreground">Email</dt><dd className="break-all">{user.email}</dd>
            <dt className="text-muted-foreground">Label</dt><dd>{user.organization.name}</dd>
            <dt className="text-muted-foreground">Role</dt><dd className="capitalize">{user.role}{user.artistName ? ` · ${user.artistName}` : ""}</dd>
            <dt className="text-muted-foreground">Member since</dt><dd>{formatInTz(user.createdAt, tz, { dateStyle: "medium" })}</dd>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">To change your login email, email <a className="underline" href={`mailto:${CONTACT.support}`}>{CONTACT.support}</a> from your current address.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Change password</CardTitle><CardDescription>You&apos;ll stay signed in here. Every other device is signed out.</CardDescription></CardHeader>
        <CardContent><ChangePasswordForm minLength={MIN_PASSWORD} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sessions</CardTitle><CardDescription>Lost a phone or used a shared computer? Sign out everywhere except this browser.</CardDescription></CardHeader>
        <CardContent><SignOutEverywhereButton /></CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {user.termsAcceptedAt ? `You agreed to the Terms and Privacy Policy on ${formatInTz(user.termsAcceptedAt, tz, { dateStyle: "medium" })}. ` : ""}
        <Link className="underline" href="/legal/terms">Terms</Link> · <Link className="underline" href="/legal/privacy">Privacy</Link>
      </p>
    </div>
  );
}
