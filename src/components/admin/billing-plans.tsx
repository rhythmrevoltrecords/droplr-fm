"use client";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CONTACT } from "@/lib/legal";
import { cn } from "@/lib/utils";

export type PlanCard = {
  tier: "free" | "artist" | "artist_pro" | "pro" | "label" | "enterprise";
  name: string;
  blurb: string;
  features: string[];
  /** Display strings per interval; null = not purchasable for that interval. */
  price: { monthly: string | null; yearly: string | null };
};

async function go(url: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (res.ok && j.url) {
    window.location.href = j.url;
    return null;
  }
  return j.error || "Something went wrong. Try again.";
}

export function ManageBillingButton({ label = "Manage billing", variant = "outline" }: { label?: string; variant?: "outline" | "default" | "white" }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button variant={variant} disabled={busy} onClick={async () => { setBusy(true); setErr(await go("/api/stripe/portal")); setBusy(false); }}>
        {busy && <Loader2 className="animate-spin" />} {label}
      </Button>
      {err && <p className="text-sm text-red-400">{err}</p>}
    </div>
  );
}

export function BillingPlans({
  plans,
  currentTier,
  subscribed,
  highlight,
  billingReady,
  defaultInterval = "monthly",
  scheduledChange = null,
}: {
  plans: PlanCard[];
  currentTier: string;
  /** Has a live Stripe subscription: changes go through the portal. */
  subscribed: boolean;
  highlight?: string | null;
  billingReady: boolean;
  defaultInterval?: "monthly" | "yearly";
  /** Subscription is set to cancel: the plan they drop to and when (already formatted). */
  scheduledChange?: { tier: string; date: string } | null;
}) {
  const [interval, setBillingInterval] = useState<"monthly" | "yearly">(defaultInterval);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const yearlyAvailable = plans.some((p) => p.price.yearly);
  const rank = (t: string) => ["free", "artist", "artist_pro", "pro", "label", "enterprise"].indexOf(t);

  async function upgrade(tier: string) {
    setBusy(tier);
    setErr(null);
    setErr(await go("/api/stripe/checkout", { tier, interval }));
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      {yearlyAvailable && (
        <div role="radiogroup" aria-label="Billing interval" className="inline-flex rounded-lg border p-1 text-sm">
          {(["monthly", "yearly"] as const).map((i) => (
            <button
              key={i}
              role="radio"
              aria-checked={interval === i}
              onClick={() => setBillingInterval(i)}
              className={cn("rounded-md px-3 py-1.5 capitalize", interval === i ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {i}
            </button>
          ))}
        </div>
      )}

      <div className={cn("grid gap-4 md:grid-cols-2", plans.length === 3 && "lg:grid-cols-3", plans.length > 3 && "xl:grid-cols-4")}>
        {plans.map((p) => {
          const current = p.tier === currentTier;
          const ending = current && !!scheduledChange;
          const next = !current && scheduledChange?.tier === p.tier;
          const price = p.tier === "free" ? "$0" : p.price[interval];
          const isUpgrade = rank(p.tier) > rank(currentTier);
          const featured = highlight ? highlight === p.tier : (p.tier === "pro" || p.tier === "artist") && currentTier === "free";
          return (
            <div
              key={p.tier}
              className={cn(
                "relative flex flex-col rounded-2xl border p-5",
                featured && !current && "border-violet-500 bg-violet-500/[0.08] shadow-[0_0_60px_-24px_rgba(124,58,237,0.7)]",
                current && (ending ? "border-amber-500/50" : "border-emerald-500/50"),
                next && "border-dashed",
              )}
            >
              {current && !ending && <span className="absolute -top-2.5 left-5 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-semibold text-black">Current plan</span>}
              {ending && <span className="absolute -top-2.5 left-5 rounded-full bg-amber-400 px-2.5 py-0.5 text-[11px] font-semibold text-black">Current plan · ends {scheduledChange!.date}</span>}
              {next && <span className="absolute -top-2.5 left-5 rounded-full border bg-background px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">From {scheduledChange!.date}</span>}
              <h3 className="font-semibold">{p.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{p.blurb}</p>
              <p className="mt-3 min-h-9">
                {p.tier === "enterprise" ? (
                  <span className="text-2xl font-bold">Custom</span>
                ) : price ? (
                  <>
                    <span className={cn("font-bold", /\d/.test(price) ? "text-2xl" : "text-base")}>{price}</span>
                    {p.tier !== "free" && /\d/.test(price) && <span className="text-sm text-muted-foreground">/{interval === "yearly" ? "yr" : "mo"}</span>}
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">Not available {interval}</span>
                )}
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><span>{f}</span></li>
                ))}
              </ul>
              <div className="mt-5">
                {ending && subscribed ? (
                  <ManageBillingButton label={`Keep ${p.name}`} />
                ) : current ? (
                  <Button variant="outline" className="w-full" disabled>Your plan</Button>
                ) : next ? (
                  <Button variant="outline" className="w-full" disabled>Starts {scheduledChange!.date}</Button>
                ) : p.tier === "enterprise" ? (
                  <Button asChild variant="outline" className="w-full"><a href={`mailto:${CONTACT.hello}?subject=droplr.fm%20Enterprise`}>Contact us</a></Button>
                ) : p.tier === "free" ? (
                  subscribed && !scheduledChange ? <ManageBillingButton label="Cancel in billing portal" /> : null
                ) : subscribed ? (
                  <ManageBillingButton label={isUpgrade ? `Switch to ${p.name}` : `Change to ${p.name}`} variant={featured ? "white" : "outline"} />
                ) : !isUpgrade ? (
                  <p className="text-center text-xs text-muted-foreground">Email {CONTACT.billing} to change</p>
                ) : (
                  <Button className="w-full" variant={featured ? "white" : "outline"} disabled={!billingReady || !price || !!busy} onClick={() => upgrade(p.tier)}>
                    {busy === p.tier ? <Loader2 className="animate-spin" /> : <Sparkles />} Upgrade to {p.name}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
    </div>
  );
}
