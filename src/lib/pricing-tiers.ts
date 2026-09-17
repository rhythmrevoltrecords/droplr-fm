import type { PriceTier } from "@/components/marketing/audience-pricing";
import { ctaCopy } from "./launch";
import { CONTACT } from "./legal";
import { PLAN_BLURB, planFeatures, planPrice, priceSuffix, yearlyPrice } from "./plan-copy";
import { type PlanKey } from "./plans";

/** Marketing plan cards for both audiences, built from PLAN_LIMITS so prices never drift from billing. */
export function pricingTiers(): { artist: PriceTier[]; label: PriceTier[] } {
  const cta = ctaCopy();
  const card = (key: PlanKey, action: { label: string; href: string }, featured = false): PriceTier => ({
    key, name: nameOf(key), price: planPrice(key), suffix: priceSuffix(key), blurb: PLAN_BLURB[key], features: planFeatures(key), featured, cta: action,
    yearly: yearlyPrice(key),
  });
  return {
    artist: [
      card("free", { label: cta.plans.free.label, href: cta.open ? "/signup?type=artist" : cta.plans.free.href }),
      card("artist", cta.plans.artist, true),
      card("artist_pro", cta.plans.artist_pro),
    ],
    label: [
      card("free", { label: cta.plans.free.label, href: cta.open ? "/signup?type=label" : cta.plans.free.href }),
      card("pro", cta.plans.pro, true),
      card("label", cta.plans.label),
      card("enterprise", { label: "Contact us", href: `mailto:${CONTACT.hello}?subject=droplr.fm%20Enterprise` }),
    ],
  };
}

const NAMES: Record<PlanKey, string> = { free: "Free", artist: "Artist", artist_pro: "Artist Pro", pro: "Pro", label: "Label", enterprise: "Enterprise" };
const nameOf = (k: PlanKey) => NAMES[k];
