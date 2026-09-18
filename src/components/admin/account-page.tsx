import { RestartTourButton } from "@/components/admin/restart-tour";
import Link from "next/link";
import { ChangePasswordForm, SignOutEverywhereButton } from "@/components/admin/account-forms";
import { PushSettings } from "@/components/admin/push-settings";
import { prisma } from "@/lib/db";
import { PUSH_KINDS } from "@/lib/push";
import { timeAgo } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MIN_PASSWORD } from "@/lib/auth";
import { CONTACT } from "@/lib/legal";
import { formatInTz } from "@/lib/time";

type AccountUser = { id: string; pushPrefs?: unknown; email: string; role: string; artistName: string | null; createdAt: Date; termsAcceptedAt: Date | null; organization: { name: string; timezone: string; kind?: string | null } };

/** Shared by /admin/settings/account (label team) and /dashboard/account (artists). */
export async function AccountPage({ user, back }: { user: AccountUser; back?: { href: string; label: string } }) {
  const tz = user.organization.timezone;
  const devices = await prisma.pushSubscription.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  const kinds = PUSH_KINDS.filter((k) => user.role !== "artist" || k.key !== "referrals");
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
            <dt className="text-muted-foreground">{user.organization.kind === "artist" ? "Account" : "Label"}</dt><dd>{user.organization.name}</dd>
            <dt className="text-muted-foreground">Role</dt><dd className="capitalize">{user.role}{user.artistName ? ` · ${user.artistName}` : ""}</dd>
            <dt className="text-muted-foreground">Member since</dt><dd>{formatInTz(user.createdAt, tz, { dateStyle: "medium" })}</dd>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">To change your login email, email <a className="underline" href={`mailto:${CONTACT.support}`}>{CONTACT.support}</a> from your current address.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Walkthrough</CardTitle><CardDescription>The quick tour of the dashboard you saw when you first logged in.</CardDescription></CardHeader>
        <CardContent><RestartTourButton home={user.role === "artist" ? "/dashboard" : "/admin"} /></CardContent>
      </Card>

      <Card id="notifications" className="scroll-mt-24">
        <CardHeader><CardTitle>App &amp; notifications</CardTitle><CardDescription>Install droplr on your phone and get notified about milestones, releases going live and replies. Set per login and per device.</CardDescription></CardHeader>
        <CardContent>
          <PushSettings
            vapidKey={process.env.VAPID_PUBLIC_KEY || null}
            kinds={kinds}
            prefs={(user.pushPrefs ?? {}) as Record<string, boolean>}
            devices={devices.map((d) => ({ id: d.id, label: d.label ?? "Browser", endpoint: d.endpoint, added: formatInTz(d.createdAt, tz, { dateStyle: "medium" }), lastSent: d.lastSentAt ? timeAgo(d.lastSentAt) : null }))}
          />
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
