import Link from "next/link";
import { Check } from "lucide-react";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Pricing" };

const TIERS = [
  {
    name: "Free", price: 0, cta: "Start free", highlight: false,
    features: ["3 releases", "1k clicks / month", "1 artist", "yourlabel.droplr.fm subdomain", "Basic analytics", "Email pre-save + release-day email"],
  },
  {
    name: "Pro", price: 29, cta: "Start Pro", highlight: true,
    features: ["Unlimited releases", "50k clicks / month", "5 artists", "Custom domain (presave.yourlabel.com)", "Custom pixels: Meta, TikTok, GA4", "BYO Spotify app for true auto-saves*", "Email capture + CSV export", "QR codes", "Remove droplr.fm branding"],
  },
  {
    name: "Label", price: 79, cta: "Start Label", highlight: false,
    features: ["Everything in Pro", "250k clicks / month", "Unlimited artists", "White-label", "Team roles (admins)", "BYO Spotify app*", "Label analytics across the roster", "API + webhooks (coming soon)"],
  },
  {
    name: "Enterprise", price: 199, cta: "Contact us", highlight: false,
    features: ["Everything in Label", "Uncapped clicks", "SLA", "SSO (coming soon)", "Priority onboarding"],
  },
];

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="container py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">Priced for labels, not per release</h1>
          <p className="mt-4 text-muted-foreground">Every plan includes email pre-saves with a release-day email. No per-release fees. USD, billed monthly.</p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TIERS.map((t) => (
            <div key={t.name} className={`relative flex flex-col rounded-2xl border p-6 ${t.highlight ? "border-violet-500 bg-violet-500/[0.08] shadow-[0_0_80px_-20px_rgba(124,58,237,0.6)]" : "border-white/10 bg-white/[0.03]"}`}>
              {t.highlight && <span className="absolute -top-3 left-6 rounded-full bg-violet-500 px-3 py-0.5 text-xs font-semibold text-white">Most Popular</span>}
              <h2 className="text-lg font-semibold">{t.name}</h2>
              <p className="mt-3"><span className="text-4xl font-bold">${t.price}</span><span className="text-muted-foreground">/mo</span></p>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><span>{f}</span></li>
                ))}
              </ul>
              <Button asChild className="mt-8" variant={t.highlight ? "white" : "outline"}>
                <Link href={t.name === "Enterprise" ? "mailto:hello@droplr.fm?subject=droplr.fm%20Enterprise" : t.price === 0 ? "/signup" : `/signup?plan=${t.name.toLowerCase()}`}>{t.cta}</Link>
              </Button>
            </div>
          ))}
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
