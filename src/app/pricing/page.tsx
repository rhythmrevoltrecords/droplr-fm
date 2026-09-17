import Link from "next/link";
import { Check } from "lucide-react";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { Button } from "@/components/ui/button";
import { ctaCopy } from "@/lib/launch";
import { CONTACT } from "@/lib/legal";
import { artistsLine, clicksLine, planPrice, priceSuffix, releasesLine } from "@/lib/plan-copy";
import { PLAN_LIMITS, type PlanKey } from "@/lib/plans";

export const metadata = { title: "Pricing" };

// Limits (price, releases, clicks, artists) come from PLAN_LIMITS; the rest describes what each plan unlocks in the product.
const TIERS: { key: PlanKey; highlight: boolean; features: string[] }[] = [
  {
    key: "free",
    highlight: false,
    features: [releasesLine("free"), clicksLine("free"), artistsLine("free"), "yourlabel.droplr.fm subdomain", "Basic analytics", "Email pre-save + release-day email"],
  },
  {
    key: "pro",
    highlight: true,
    features: [
      releasesLine("pro"),
      clicksLine("pro"),
      artistsLine("pro"),
      "Custom domain (presave.yourlabel.com), connected for you",
      "Custom pixels: Meta, TikTok, GA4",
      "BYO Spotify app for true auto-saves*",
      "Email capture + CSV export",
      "QR codes",
      "Remove droplr.fm branding",
    ],
  },
  {
    key: "label",
    highlight: false,
    // PLAN_LIMITS.whiteLabel only gates team roles (admin invites), so it's listed as that, not as a separate "White-label" feature.
    features: ["Everything in Pro", clicksLine("label"), artistsLine("label"), "Team roles (admins)", "Label analytics across the roster", "API + webhooks (coming soon)"],
  },
  {
    key: "enterprise",
    highlight: false,
    features: ["Everything in Label", clicksLine("enterprise"), "Priority support and onboarding", "SSO (coming soon)"],
  },
];

export default function PricingPage() {
  const cta = ctaCopy();
  const tierCta = (k: PlanKey) =>
    k === "enterprise" ? { label: "Contact us", href: `mailto:${CONTACT.hello}?subject=droplr.fm%20Enterprise` } : cta.plans[k];
  return (
    <MarketingShell>
      <section className="container py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          {cta.hint && (
            <p className="mx-auto mb-5 w-fit max-w-full rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
              {cta.hint.text} <Link href={cta.hint.link.href} className="underline">{cta.hint.link.label}</Link>
            </p>
          )}
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">Priced for labels, not per release</h1>
          <p className="mt-4 text-muted-foreground">Every plan includes email pre-saves with a release-day email. No per-release fees. Prices in Australian dollars (AUD), including any tax, billed monthly or yearly.</p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TIERS.map((t) => {
            const p = PLAN_LIMITS[t.key];
            const action = tierCta(t.key);
            return (
              <div key={t.key} className={`relative flex flex-col rounded-2xl border p-6 ${t.highlight ? "border-violet-500 bg-violet-500/[0.08] shadow-[0_0_80px_-20px_rgba(124,58,237,0.6)]" : "border-white/10 bg-white/[0.03]"}`}>
                {t.highlight && <span className="absolute -top-3 left-6 rounded-full bg-violet-500 px-3 py-0.5 text-xs font-semibold text-white">Most Popular</span>}
                <h2 className="text-lg font-semibold">{p.name}</h2>
                <p className="mt-3"><span className="text-4xl font-bold">{planPrice(t.key)}</span><span className="text-muted-foreground">{priceSuffix(t.key)}</span></p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {t.features.map((f) => (
                    <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><span>{f}</span></li>
                  ))}
                </ul>
                <Button asChild className="mt-8" variant={t.highlight ? "white" : "outline"}>
                  <Link href={action.href}>{action.label}</Link>
                </Button>
              </div>
            );
          })}
        </div>
        <div className="mx-auto mt-10 max-w-3xl space-y-2 text-center text-sm text-muted-foreground">
          <p>All plans include email pre-saves and a release-day email to every fan who opted in. No per-release fees.</p>
          <p>Already have an account? Upgrade from <Link href="/admin/settings/billing" className="underline">Settings → Plan &amp; billing</Link>. Paid plans renew automatically; cancel any time. <Link href="/legal/billing" className="underline">Billing &amp; refunds</Link></p>
          <p>
            * True auto-saves run through a Spotify developer app you create and own. Spotify limits Development Mode apps to 5 allowlisted users. Going past that needs Spotify&apos;s Extended Quota approval, which is up to Spotify. <Link href="/docs/spotify-byo" className="underline">How it works</Link>
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
