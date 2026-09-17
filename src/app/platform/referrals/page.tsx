import { PlatformChrome } from "@/components/platform/platform-chrome";
import { RunReferralsButton } from "@/components/platform/run-referrals-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/platform";
import { planOf } from "@/lib/plans";
import { REFERRAL_CAP, REFERRAL_QUALIFY_DAYS } from "@/lib/referrals";
import { formatInTz } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Referrals · Platform", robots: { index: false, follow: false } };

const variant = (s: string) => (s === "applied" ? "success" : s === "earned" ? "warning" : "secondary");

export default async function PlatformReferrals() {
  const admin = await requirePlatformAdmin();
  const referrals = await prisma.referral.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      referrer: { select: { name: true, plan: true, stripeSubscriptionId: true } },
      referred: { select: { name: true, plan: true, stripeSubscriptionId: true } },
    },
  });
  const by = (s: string) => referrals.filter((r) => r.status === s).length;
  const tz = "Australia/Brisbane";
  return (
    <PlatformChrome email={admin.email} active="referrals">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Referrals</h1>
          <p className="text-sm text-muted-foreground">{referrals.length} total · {by("pending")} pending · {by("earned")} earned, not applied · {by("applied")} applied · {by("capped")} over the cap</p>
        </div>
        <RunReferralsButton />
      </div>
      <Card className="p-4 text-sm text-muted-foreground">
        Checked daily. A referral earns once the referred account has an active subscription that started {REFERRAL_QUALIFY_DAYS}+ days ago with a paid invoice; max {REFERRAL_CAP} per referrer in 12 months. Earned months go on the referrer&apos;s next invoice as a one-time percent-off coupon (one per invoice). A note on an earned row means applying failed: check it in Stripe.
      </Card>
      <Card className="overflow-x-auto p-0">
        <Table>
          <THead><TR><TH>Referrer</TH><TH>Referred</TH><TH>Status</TH><TH>Joined</TH><TH>Earned</TH><TH>Applied</TH><TH>Note</TH></TR></THead>
          <TBody>
            {referrals.map((r) => (
              <TR key={r.id}>
                <TD><div className="font-medium">{r.referrer.name}</div><div className="text-xs text-muted-foreground">{planOf(r.referrer.plan).name}{r.referrer.stripeSubscriptionId ? " · Stripe" : ""}</div></TD>
                <TD><div className="font-medium">{r.referred.name}</div><div className="text-xs text-muted-foreground">{planOf(r.referred.plan).name}{r.referred.stripeSubscriptionId ? " · Stripe" : ""}</div></TD>
                <TD><Badge variant={variant(r.status)}>{r.status}</Badge></TD>
                <TD className="whitespace-nowrap text-xs">{formatInTz(r.createdAt, tz, { dateStyle: "medium" })}</TD>
                <TD className="whitespace-nowrap text-xs">{r.earnedAt ? formatInTz(r.earnedAt, tz, { dateStyle: "medium" }) : "—"}</TD>
                <TD className="whitespace-nowrap text-xs">{r.appliedAt ? formatInTz(r.appliedAt, tz, { dateStyle: "medium" }) : "—"}{r.stripeCouponId ? <div className="font-mono text-[10px] text-muted-foreground">{r.stripeCouponId}</div> : null}</TD>
                <TD className="max-w-[260px] text-xs text-muted-foreground">{r.note ?? ""}</TD>
              </TR>
            ))}
            {!referrals.length && <TR><TD colSpan={7} className="py-10 text-center text-muted-foreground">No referrals yet.</TD></TR>}
          </TBody>
        </Table>
      </Card>
    </PlatformChrome>
  );
}
