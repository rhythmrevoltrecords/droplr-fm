import Link from "next/link";
import { redirect } from "next/navigation";
import { CleanUrl } from "@/components/admin/clean-url";
import { BillingPlans, ManageBillingButton, type PlanCard } from "@/components/admin/billing-plans";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { applySubscription, clearStaleStripeIds, formatMoney, getPriceTable, getSubscriptionSummary } from "@/lib/billing";
import { prisma } from "@/lib/db";
import { CONTACT } from "@/lib/legal";
import { PLAN_BLURB, planFeatures } from "@/lib/plan-copy";
import { accountKind, PLAN_LIMITS, planOf, PLANS_FOR, releaseWindowStart, type PlanKey } from "@/lib/plans";
import { getStripe, priceIdFor, stripeConfigured, stripeId, stripeTestMode } from "@/lib/stripe";
import { formatInTz, zonedDay, zonedLocalToDate } from "@/lib/time";
import { cn, fmtNum } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing" };

/** Checkout success: apply the subscription now instead of waiting for the webhook. */
async function syncCheckout(sessionId: string, orgId: string) {
  if (!stripeConfigured() || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return false;
  try {
    const s = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
    if (s.client_reference_id !== orgId || s.status !== "complete" || !s.subscription || typeof s.subscription === "string") return false;
    await applySubscription(orgId, s.subscription);
    if (!s.subscription.customer && s.customer) await prisma.organization.update({ where: { id: orgId }, data: { stripeCustomerId: stripeId(s.customer) } });
    return true;
  } catch (err) {
    console.error("[billing sync]", err);
    return false;
  }
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const finite = Number.isFinite(limit);
  const ratio = finite ? Math.min(used / limit, 1) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{fmtNum(used)}{finite ? ` / ${fmtNum(limit)}` : " · unlimited"}</span>
      </div>
      {finite && (
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={used} aria-valuemax={limit} aria-label={label}>
          <div className={cn("h-full rounded-full", ratio >= 1 ? "bg-red-400" : ratio >= 0.8 ? "bg-amber-400" : "bg-violet-500")} style={{ width: `${Math.max(ratio * 100, used ? 3 : 0)}%` }} />
        </div>
      )}
    </div>
  );
}

export default async function BillingPage(
  props: { searchParams: Promise<{ upgraded?: string; canceled?: string; session_id?: string; plan?: string }> }
) {
  const searchParams = await props.searchParams;
  const user = await requireUser("label");
  // Stripe returns here with ?session_id=cs_…: apply the subscription, then redirect so the ID never sits in the address bar or history.
  if (searchParams.session_id) {
    await syncCheckout(searchParams.session_id, user.organizationId);
    redirect("/admin/settings/billing?upgraded=1");
  }
  // Ids left over from sandbox testing don't exist on live keys: clear them and reload with the corrected plan.
  if (await clearStaleStripeIds(user.organization)) redirect("/admin/settings/billing");
  const org = user.organization;
  const tier = (org.plan in PLAN_LIMITS ? org.plan : "free") as PlanKey;
  const plan = planOf(tier);

  const monthStart = zonedLocalToDate(`${zonedDay(new Date(), org.timezone).slice(0, 8)}01T00:00`, org.timezone);
  const [releaseCount, artistCount, clicks, prices, summary] = await Promise.all([
    prisma.release.count({ where: { organizationId: org.id, createdAt: { gte: releaseWindowStart() } } }),
    prisma.artist.count({ where: { organizationId: org.id } }), // roster profiles hold the artist seats
    prisma.clickEvent.count({ where: { release: { organizationId: org.id }, createdAt: { gte: monthStart } } }),
    getPriceTable(),
    getSubscriptionSummary(org.stripeSubscriptionId),
  ]);

  const show = (t: "artist" | "artist_pro" | "pro" | "label", i: "monthly" | "yearly") => {
    const p = prices[t][i];
    if (!priceIdFor(t, i)) return null;
    // Price exists but Stripe didn't answer: still purchasable, amount shows on the checkout page.
    return (p && formatMoney(p.amount, p.currency)) ?? (i === "monthly" && PLAN_LIMITS[t].price !== null ? `$${PLAN_LIMITS[t].price} AUD` : "Price shown at checkout");
  };
  const kind = accountKind(org.kind);
  const plans: PlanCard[] = PLANS_FOR[kind].map((t) => ({
    tier: t,
    name: PLAN_LIMITS[t].name,
    blurb: PLAN_BLURB[t],
    features: planFeatures(t),
    price: t === "artist" || t === "artist_pro" || t === "pro" || t === "label" ? { monthly: show(t, "monthly"), yearly: show(t, "yearly") } : { monthly: null, yearly: null },
  }));

  const subscribed = !!org.stripeSubscriptionId;
  const firstPaid = kind === "artist" ? "artist" : "pro"; // online upgrades are "on" once the entry paid plan has a price
  const billingReady = stripeConfigured() && !!(priceIdFor(firstPaid, "monthly") || priceIdFor(firstPaid, "yearly"));
  const highlight = searchParams.plan && (PLANS_FOR[kind] as string[]).includes(searchParams.plan) ? searchParams.plan : null;
  const pending = searchParams.upgraded && tier === "free";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground"><Link href="/admin/settings" className="hover:underline">Settings</Link> / Billing</p>
          <h1 className="text-2xl font-semibold">Plan &amp; billing</h1>
        </div>
        {org.stripeCustomerId && <ManageBillingButton label="Invoices & payment method" />}
      </div>

      {(searchParams.upgraded || searchParams.canceled || searchParams.plan) && <CleanUrl path="/admin/settings/billing" />}
      {searchParams.upgraded && !pending && (
        <Card className="border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">You&apos;re on {plan.name}. Everything in the plan is switched on now.</Card>
      )}
      {pending && (
        <Card className="border-amber-500/40 bg-amber-500/10 p-4 text-sm">Payment received. Your plan is still updating; refresh in a few seconds.</Card>
      )}
      {searchParams.canceled && <Card className="p-4 text-sm text-muted-foreground">Checkout cancelled. You haven&apos;t been charged.</Card>}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <span><strong>Refer a friend, get a month free.</strong> <span className="text-muted-foreground">When someone you refer has paid for 30 days, your next bill is on us (up to 3 a year).</span></span>
        <Link href="/admin/referrals" className="shrink-0 underline">Get your link</Link>
      </Card>
      {stripeConfigured() && stripeTestMode() && (
        <Card className="border-sky-500/40 bg-sky-500/10 p-4 text-sm">
          Stripe test mode: no real charges. Pay with card <code className="font-mono">4242 4242 4242 4242</code>, any future expiry, any CVC.
        </Card>
      )}
      {!billingReady && (
        <Card className="border-amber-500/40 bg-amber-500/10 p-4 text-sm">Online upgrades aren&apos;t switched on for this deployment yet. Email <a className="underline" href={`mailto:${CONTACT.billing}`}>{CONTACT.billing}</a> to upgrade.</Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {plan.name}
              {summary?.status === "past_due" && <Badge variant="danger">Payment failed</Badge>}
              {summary?.cancelAtPeriodEnd && <Badge variant="warning">Cancels at period end</Badge>}
              {summary && summary.status === "active" && !summary.cancelAtPeriodEnd && <Badge variant="success">Active</Badge>}
              {org.compPlan && <Badge variant="success">Complimentary</Badge>}
            </CardTitle>
            <CardDescription>
              {org.compPlan && !subscribed
                ? "Provided free of charge."
                : tier === "free"
                ? "No card needed. Upgrade any time; paid features switch on as soon as payment goes through."
                : summary
                  ? <>
                      {summary.amount && `${summary.amount} ${summary.interval === "yearly" ? "per year" : "per month"}. `}
                      {summary.periodEnd && (summary.cancelAtPeriodEnd ? `Paid features end ${formatInTz(summary.periodEnd, org.timezone, { dateStyle: "medium" })}, then you move to ${org.compPlan ? `your complimentary ${planOf(org.compPlan).name} plan` : "Free"}.` : `Renews ${formatInTz(summary.periodEnd, org.timezone, { dateStyle: "medium" })}.`)}
                    </>
                  : "Billed through Stripe."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary?.status === "past_due" && (
              <p className="text-sm text-red-400">Stripe couldn&apos;t charge your card. Update it in the billing portal to keep {plan.name} features.</p>
            )}
            {subscribed ? (
              <ManageBillingButton label="Change plan or cancel" />
            ) : org.compPlan ? (
              <p className="text-sm text-muted-foreground">Complimentary {planOf(org.compPlan).name} plan from droplr.fm: no charge, no card needed.{org.compPlan !== "enterprise" ? " You can still upgrade to a higher plan below." : ""}</p>
            ) : tier === "free" ? (
              <p className="text-sm text-muted-foreground">Pick a plan below.</p>
            ) : (
              <p className="text-sm text-muted-foreground">This plan was set up manually. Email {CONTACT.billing} for changes.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Usage</CardTitle><CardDescription>This month ({org.locationLabel} time).</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Meter label="New releases (last 12 months)" used={releaseCount} limit={plan.releases} />
            <Meter label="Link clicks this month" used={clicks} limit={plan.clicksPerMonth} />
            {kind === "label" && <Meter label="Artists" used={artistCount} limit={plan.artists} />}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{tier === "free" ? "Upgrade" : "Plans"}</h2>
        <BillingPlans
          plans={plans}
          currentTier={tier}
          subscribed={subscribed}
          highlight={highlight}
          billingReady={billingReady}
          defaultInterval={summary?.interval ?? "monthly"}
          scheduledChange={
            summary?.cancelAtPeriodEnd && summary.periodEnd
              ? { tier: org.compPlan ?? "free", date: formatInTz(summary.periodEnd, org.timezone, { dateStyle: "medium" }) }
              : null
          }
        />
        <p className="text-xs text-muted-foreground">
          Prices are in AUD and include any tax. Plans are sold through Link (Stripe) and renew automatically until cancelled. Cancel any time: you keep paid features until the end of the period you&apos;ve paid for. No refunds for partial periods, except where the law requires. See the <Link className="underline" href="/legal/billing">Billing &amp; Refund Policy</Link> and <Link className="underline" href="/legal/terms">Terms</Link>.
        </p>
      </section>
    </div>
  );
}
