"use client";
import Link from "next/link";
import { useState } from "react";
import type { Audience } from "@/components/marketing/audience-pricing";

/** One plan as the homepage summary shows it. Built on the server from PLAN_LIMITS and pricingTiers(). */
export type ShowcasePlan = {
  key: string;
  name: string;
  price: string;
  suffix: string;
  yearly: string | null;
  /** A plain sentence above the bullets, for the one plan that has to say something up front. */
  lead?: string;
  bullets: string[];
  featured?: boolean;
  cta: { label: string; href: string };
};

function Check() {
  return <svg aria-hidden focusable="false"><use href="#sc-i-check" /></svg>;
}

/** The artist/label switch and three plans a side. Full lists live on /pricing. */
export function ShowcasePricing({ artist, label, heading, pill, foot, labelFoot }: { artist: ShowcasePlan[]; label: ShowcasePlan[]; heading: React.ReactNode; pill: string; foot: React.ReactNode; labelFoot: React.ReactNode }) {
  const [aud, setAud] = useState<Audience>("artist");
  const sets: [Audience, ShowcasePlan[]][] = [["artist", artist], ["label", label]];
  return (
    <>
      <div className="sc-price-head sc-rv">
        {heading}
        <div className="sc-price-tools">
          <span className="sc-pill">{pill}</span>
          <div className="sc-switch" role="group" aria-label="Show prices for">
            {(["artist", "label"] as const).map((a) => (
              <button key={a} type="button" aria-pressed={aud === a} onClick={() => setAud(a)}>{a === "artist" ? "Artists" : "Labels"}</button>
            ))}
          </div>
        </div>
      </div>
      {sets.map(([a, plans]) => (
        <div key={a} className="sc-plans" hidden={aud !== a}>
          {plans.map((p) => (
            <div key={p.key} className={p.featured ? "sc-plan sc-hi" : "sc-plan"}>
              <h3>{p.name}</h3>
              <div className="sc-amt">{p.price}{p.suffix && <small>{p.suffix}</small>}</div>
              {p.yearly && <p className="sc-yr">or {p.yearly} a year, two months free</p>}
              {p.lead && <p className="sc-lead-copy">{p.lead}</p>}
              <ul>
                {p.bullets.map((b) => <li key={b}><Check />{b}</li>)}
              </ul>
              <Link className={p.featured ? "sc-btn sc-btn-primary" : "sc-btn sc-btn-ghost"} href={p.cta.href}>{p.cta.label}</Link>
            </div>
          ))}
        </div>
      ))}
      <div className="sc-price-foot">
        <span>{foot}{aud === "label" && <> {labelFoot}</>}</span>
        <Link href="/pricing">Full pricing →</Link>
      </div>
    </>
  );
}
