import type { PriceTier } from "@/components/marketing/audience-pricing";
import { ctaCopy } from "./launch";
import { CONTACT } from "./legal";
import { artistsLine, clicksLine, planPrice, priceSuffix, releasesLine } from "./plan-copy";
import { PLAN_LIMITS } from "./plans";

/** Marketing plan cards for both audiences, built from PLAN_LIMITS so prices never drift from billing. */
export function pricingTiers(): { artist: PriceTier[]; label: PriceTier[] } {
  const cta = ctaCopy();
  const free = (who: "artist" | "label"): PriceTier => ({
    key: "free", name: "Free", price: planPrice("free"), suffix: "", blurb: "Try it on your next few releases.",
    features: [releasesLine("free"), clicksLine("free"), "yourname.droplr.fm links", "Email pre-save in each fan's timezone", "Promo plan + share graphics", "Insights: busiest hours, countries, stores"],
    cta: { label: cta.plans.free.label, href: cta.open ? `/signup?type=${who}` : cta.plans.free.href },
  });
  return {
    artist: [
      free("artist"),
      {
        key: "artist", name: "Artist", price: planPrice("artist"), suffix: priceSuffix("artist"), featured: true,
        blurb: "For an independent artist releasing regularly.",
        features: [releasesLine("artist"), clicksLine("artist"), "Fan list with news opt-ins + CSV export", "Custom domain (music.yourname.com)", "Meta, TikTok and GA4 pixels", "QR codes for flyers and merch", "No droplr.fm branding on pages or graphics"],
        cta: cta.plans.artist,
      },
    ],
    label: [
      free("label"),
      {
        key: "pro", name: "Pro", price: planPrice("pro"), suffix: priceSuffix("pro"), featured: true,
        blurb: "For a label putting out music every month.",
        features: [releasesLine("pro"), clicksLine("pro"), artistsLine("pro"), "Artist logins + roster profiles", "Custom domain, connected for you", "Pixels, CSV export, QR codes", "Remove droplr.fm branding"],
        cta: cta.plans.pro,
      },
      {
        key: "label", name: "Label", price: planPrice("label"), suffix: priceSuffix("label"),
        blurb: "For a roster with a team behind it.",
        features: ["Everything in Pro", clicksLine("label"), artistsLine("label"), "Team roles (admins)", "Analytics across the whole roster"],
        cta: cta.plans.label,
      },
      {
        key: "enterprise", name: "Enterprise", price: PLAN_LIMITS.enterprise.price === null ? "Custom" : planPrice("enterprise"), suffix: "",
        blurb: "Distributors and big catalogues.",
        features: ["Everything in Label", clicksLine("enterprise"), "Priority support and onboarding", "SSO (coming soon)"],
        cta: { label: "Contact us", href: `mailto:${CONTACT.hello}?subject=droplr.fm%20Enterprise` },
      },
    ],
  };
}
