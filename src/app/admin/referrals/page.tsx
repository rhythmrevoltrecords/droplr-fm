import Link from "next/link";
import { CopyButton } from "@/components/admin/copy-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { earnedInWindow, REFERRAL_CAP, REFERRAL_QUALIFY_DAYS, referralCodeFor, referralLink } from "@/lib/referrals";
import { formatInTz } from "@/lib/time";

export const metadata = { title: "Refer a friend" };

const STATUS: Record<string, { label: string; variant: "secondary" | "warning" | "success" }> = {
  pending: { label: "Joined, not paying 30 days yet", variant: "secondary" },
  earned: { label: "Free month earned", variant: "warning" },
  applied: { label: "Free month applied", variant: "success" },
  capped: { label: "Over this year's limit", variant: "secondary" },
  void: { label: "Doesn't qualify", variant: "secondary" },
};

export default async function ReferralsPage() {
  const user = await requireUser("label");
  const org = user.organization;
  const [code, referrals, used] = await Promise.all([
    referralCodeFor(org.id),
    prisma.referral.findMany({ where: { referrerOrgId: org.id }, orderBy: { createdAt: "desc" }, include: { referred: { select: { name: true } } } }),
    earnedInWindow(org.id),
  ]);
  const link = referralLink(code);
  const waiting = referrals.filter((r) => r.status === "earned").length;
  const tz = org.timezone;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground"><Link href="/admin/settings" className="hover:underline">Settings</Link> / Refer a friend</p>
        <h1 className="text-2xl font-semibold">Refer a friend, get a month free</h1>
        <p className="text-sm text-muted-foreground">Share your link. When someone signs up with it and has been on a paid plan for {REFERRAL_QUALIFY_DAYS} days, your next bill is free. Up to {REFERRAL_CAP} free months in any 12 months.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Your link</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-secondary px-3 py-2 text-sm">{link}</code>
          <CopyButton value={link} label="Copy link" />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Signed up with your link</p><p className="mt-1 text-2xl font-semibold tabular-nums">{referrals.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Free months earned (last 12 months)</p><p className="mt-1 text-2xl font-semibold tabular-nums">{used} <span className="text-base font-normal text-muted-foreground">/ {REFERRAL_CAP}</span></p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Waiting to be applied</p><p className="mt-1 text-2xl font-semibold tabular-nums">{waiting}</p></Card>
      </div>

      {waiting > 0 && !org.stripeSubscriptionId && (
        <Card className="border-violet-500/40 bg-violet-500/10 p-4 text-sm">You have {waiting} free month{waiting === 1 ? "" : "s"} waiting. <Link href="/admin/settings/billing" className="underline">Choose a paid plan</Link> and it comes off your next bill (applied within a day).</Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>People you&apos;ve referred</CardTitle>
          {!referrals.length && <CardDescription>No one yet. Send your link to an artist or label you know.</CardDescription>}
        </CardHeader>
        {referrals.length > 0 && (
          <CardContent className="space-y-1 px-2">
            {referrals.map((r) => {
              const s = STATUS[r.status] ?? STATUS.pending;
              return (
                <div key={r.id} className="flex min-w-0 items-center gap-3 rounded-lg px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.referred.name}</span>
                    <span className="block text-xs text-muted-foreground">Joined {formatInTz(r.createdAt, tz, { dateStyle: "medium" })}{r.appliedAt ? ` · applied ${formatInTz(r.appliedAt, tz, { dateStyle: "medium" })}` : ""}</span>
                  </span>
                  <Badge variant={s.variant}>{s.label}</Badge>
                </div>
              );
            })}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader><CardTitle>How it works</CardTitle></CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Your friend signs up through your link within 30 days of opening it, as a new account.</li>
            <li>Once they&apos;ve paid for any plan for {REFERRAL_QUALIFY_DAYS} days and are still subscribed, you earn one free month.</li>
            <li>It comes off your next bill: a whole monthly bill, or one month&apos;s worth (1/12) of a yearly bill. One free month per bill; extras roll to the next one.</li>
            <li>No paid plan yet? Earned months wait until you subscribe.</li>
            <li>Up to {REFERRAL_CAP} free months in any 12 months. Free months have no cash value. Referring your own accounts doesn&apos;t count. Full terms: <Link href="/legal/billing#referrals" className="underline">Billing policy</Link>.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
