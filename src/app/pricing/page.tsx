import Link from "next/link";
import { AudiencePricing } from "@/components/marketing/audience-pricing";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { ctaCopy } from "@/lib/launch";
import { pricingTiers } from "@/lib/pricing-tiers";

export const metadata = { title: "Pricing" };

export default async function PricingPage(props: { searchParams: Promise<{ for?: string }> }) {
  const sp = await props.searchParams;
  const cta = ctaCopy();
  const tiers = pricingTiers();
  return (
    <MarketingShell>
      <section className="relative overflow-hidden">
        <div aria-hidden className="mk-grid-bg pointer-events-none absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-96" style={{ background: "radial-gradient(50% 100% at 50% 0%, rgba(139,92,246,.28), transparent 70%)" }} />
        <div className="container relative py-16 md:py-24">
          <div className="mx-auto max-w-2xl text-center">
            {cta.hint && (
              <p className="mx-auto mb-5 w-fit max-w-full rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
                {cta.hint.text} <Link href={cta.hint.link.href} className="underline">{cta.hint.link.label}</Link>
              </p>
            )}
            <h1 className="mk-text-gradient text-balance text-5xl font-semibold tracking-[-0.035em] sm:text-6xl">Priced per account, not per release.</h1>
            <p className="mt-5 text-lg text-white/60">Every plan includes email pre-saves in each fan&apos;s timezone, promo plans, share graphics and insights. Prices in Australian dollars (AUD), including any tax, billed monthly or yearly.</p>
          </div>
          <div className="mt-12">
            <AudiencePricing detailed artist={tiers.artist} label={tiers.label} initial={sp.for === "label" ? "label" : "artist"} />
          </div>
          <div className="mx-auto mt-12 max-w-3xl space-y-2 text-center text-sm text-white/55">
            <p>Already have an account? Upgrade from <Link href="/admin/settings/billing" className="underline">Settings → Plan &amp; billing</Link>. Paid plans renew automatically; cancel any time. <Link href="/legal/billing" className="underline">Billing &amp; refunds</Link></p>
            <p>
              Spotify only allows library saves through a developer app you create and own, and limits it to 5 Spotify accounts you allowlist by hand (Extended Quota is reserved for businesses with 250,000+ monthly users). Paid plans can connect one for your team and VIPs; every other fan pre-saves by email, picks their store and can follow on Spotify. <Link href="/docs/spotify-byo" className="underline">How it works</Link>
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
