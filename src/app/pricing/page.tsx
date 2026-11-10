import Link from "next/link";
import { PricingView, type PricingCard, type PricingSide } from "@/components/marketing/pricing/pricing-view";
import "@/components/marketing/showcase/showcase.css";
import "@/components/marketing/pricing/pricing.css";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { ctaCopy } from "@/lib/launch";
import { CONTACT } from "@/lib/legal";
import { ARTIST_PLANS, LABEL_PLANS, PLAN_FOR, compareGroups, planHighlights } from "@/lib/plan-compare";
import { planPrice } from "@/lib/plan-copy";
import { PLAN_LIMITS, type PlanKey } from "@/lib/plans";
import { pricingTiers } from "@/lib/pricing-tiers";
import { pageMeta } from "@/lib/seo";

// Read from the plan table, so a price change can't leave a stale number in Google's snippet.
const DESCRIPTION = `Start free. Paid plans from A$${PLAN_LIMITS.artist.price} a month for an artist, or A$${PLAN_LIMITS.pro.price} for a label.`;
const meta = pageMeta({ title: "Pricing", description: DESCRIPTION, path: "/pricing" });
// A page-level openGraph replaces the layout's, so type and site name are restated here.
export const metadata = { ...meta, openGraph: { ...meta.openGraph, type: "website" as const, siteName: "droplr.fm" } };

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n: number) => WORDS[n] ?? String(n);

// No searchParams here: reading them makes the route dynamic, and this page is the same for
// everyone. ?for=label is handled inside PricingView, which is already a client component.
export default function PricingPage() {
  const cta = ctaCopy();
  const tiers = pricingTiers();
  const free = PLAN_LIMITS.free;

  const side = (aud: "artist" | "label", keys: PlanKey[]): PricingSide => ({
    cards: tiers[aud].map((t): PricingCard => ({
      key: t.key, name: t.name, forWho: PLAN_FOR[t.key as PlanKey], price: t.price, suffix: t.suffix ? "/month" : "",
      usd: t.usd ?? null, yearly: t.yearly ?? null, usdYearly: t.usdYearly ?? null,
      // Free is one artist for a label too, so the label side says so before anything else.
      blurb: aud === "label" && t.key === "free" ? `Start free with ${word(free.artists)} artist and ${word(free.releases)} releases a year. Add your roster on Pro.` : t.blurb,
      highlights: planHighlights(t.key as PlanKey), featured: t.featured, cta: t.cta,
    })),
    columns: keys.map((k) => ({ key: k, name: PLAN_LIMITS[k].name, price: PLAN_LIMITS[k].price === null ? "Custom" : `${planPrice(k)}/month` })),
    groups: compareGroups(keys),
  });

  return (
    <MarketingShell glow={false}>
      <main className="sc pr">
        <div className="sc-wrap">
          <section className="pr-top" aria-labelledby="pr-h">
            <h1 className="sc-display" id="pr-h"><span className="sc-l">Per account.</span> <span className="sc-l">Never per <em>release.</em></span></h1>
            <p className="sc-lede">
              Start free with {word(free.artists)} artist and {word(free.releases)} new releases in any 12 months, as an artist or a label.
              Prices in Australian dollars, tax included, monthly or yearly with two months free. No per-release fees.
            </p>
            {cta.hint && <p className="sc-hint">{cta.hint.text} <Link href={cta.hint.link.href}>{cta.hint.link.label}</Link></p>}
          </section>

          <PricingView artist={side("artist", ARTIST_PLANS)} label={side("label", LABEL_PLANS)} pill="Yearly: two months free" />

          <dl className="pr-facts" aria-label="Good to know">
            <div>
              <dt>Your fan list is yours</dt>
              <dd>Every address is visible on Free. CSV export, with each fan&apos;s consent, starts on Artist at {planPrice("artist")}/month. No per-link cap or extra charge.</dd>
            </div>
            <div>
              <dt>Billing</dt>
              <dd>AUD, tax included. Paid plans renew monthly or yearly; cancel any time. <Link href="/legal/billing">Billing &amp; refunds</Link>. US figures are a guide; your bank converts on the day.</dd>
            </div>
            <div>
              <dt>Spotify pre-saves</dt>
              <dd>Library saves need your own Spotify app, which Spotify limits to 5 allowlisted accounts (Extended Quota is for businesses with 250,000+ monthly users). Artist Pro and the label plans can connect one; every other fan pre-saves by email. <Link href="/docs/spotify-byo">How it works</Link></dd>
            </div>
            <div>
              <dt>Support is a person</dt>
              <dd>droplr is built by one person in Brisbane. Feedback from the app goes straight to him. Enterprise or a big catalogue: <a href={`mailto:${CONTACT.hello}?subject=droplr.fm%20Enterprise`}>{CONTACT.hello}</a>.</dd>
            </div>
            <div>
              <dt>Already have an account?</dt>
              <dd>Upgrade from <Link href="/admin/settings/billing">Settings → Plan &amp; billing</Link>.</dd>
            </div>
          </dl>
        </div>
      </main>
    </MarketingShell>
  );
}
