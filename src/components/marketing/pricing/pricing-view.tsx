"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Audience } from "@/components/marketing/audience-pricing";
import type { CompareGroup } from "@/lib/plan-compare";

export type PricingCard = {
  key: string;
  name: string;
  /** Who it's for, e.g. "Label · up to 5 artists". */
  forWho: string;
  price: string;
  suffix: string;
  usd: string | null;
  yearly: string | null;
  usdYearly: string | null;
  blurb: string;
  highlights: string[];
  featured?: boolean;
  cta: { label: string; href: string };
};
export type PricingSide = { cards: PricingCard[]; columns: { key: string; name: string; price: string }[]; groups: CompareGroup[] };

const AUDS: Audience[] = ["artist", "label"];

/**
 * Artist/label switch as a real radio group: one tab stop, arrow keys move and select (WAI-ARIA
 * radio pattern), Home/End jump. Both buttons are 44px tall.
 */
function Switch({ value, onChange, label }: { value: Audience; onChange: (a: Audience) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (to: number) => {
    const a = AUDS[(to + AUDS.length) % AUDS.length];
    onChange(a);
    refs.current[AUDS.indexOf(a)]?.focus();
  };
  return (
    <div className="pr-switch" role="radiogroup" aria-label={label}>
      {AUDS.map((a, i) => (
        <button
          key={a}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="radio"
          aria-checked={value === a}
          tabIndex={value === a ? 0 : -1}
          onClick={() => onChange(a)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(i + 1); }
            else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(i - 1); }
            else if (e.key === "Home") { e.preventDefault(); move(0); }
            else if (e.key === "End") { e.preventDefault(); move(AUDS.length - 1); }
          }}
        >
          {a === "artist" ? "For artists" : "For labels"}
        </button>
      ))}
    </div>
  );
}

function Check() {
  return <svg aria-hidden focusable="false" viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Value({ v }: { v: boolean | string }) {
  if (v === true) return <><Check /><span className="sr-only">Included</span></>;
  if (v === false) return <><span aria-hidden className="pr-no">—</span><span className="sr-only">Not included</span></>;
  return <>{v}</>;
}

/**
 * Plan cards and the full comparison for one audience at a time, behind one switch. `?for=label`
 * is read here, after mount, so /pricing stays statically rendered (see test:seo).
 */
export function PricingView({ artist, label, pill }: { artist: PricingSide; label: PricingSide; pill: string }) {
  const [aud, setAud] = useState<Audience>("artist");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("for") === "label") setAud("label");
  }, []);
  const side = aud === "artist" ? artist : label;
  const cols = side.columns.length;
  return (
    <>
      <div className="pr-tools">
        <Switch value={aud} onChange={setAud} label="Show plans for" />
        <span className="sc-pill">{pill}</span>
      </div>

      <div className={`pr-cards pr-cols-${side.cards.length}`}>
        {side.cards.map((c) => (
          <div key={c.key} className={c.featured ? "pr-card pr-hi" : "pr-card"}>
            <div className="pr-card-h">
              <h3>{c.name}</h3>
              {c.featured && <span className="pr-rec">Recommended</span>}
            </div>
            <p className="pr-for">{c.forWho}</p>
            <div className="pr-amt">{c.price}{c.suffix && <small>{c.suffix}</small>}</div>
            {(c.usd || c.yearly) && (
              <p className="pr-sub">
                {c.usd && <>≈ {c.usd}{c.suffix}. </>}
                {c.yearly && <>Or {c.yearly} a year{c.usdYearly ? ` (≈ ${c.usdYearly})` : ""}, two months free.</>}
              </p>
            )}
            <p className="pr-blurb">{c.blurb}</p>
            <ul>{c.highlights.map((h) => <li key={h}><Check />{h}</li>)}</ul>
            <Link className={c.featured ? "sc-btn sc-btn-primary" : "sc-btn sc-btn-ghost"} href={c.cta.href}>{c.cta.label}</Link>
          </div>
        ))}
      </div>
      <p className="pr-jump"><a href="#compare">Compare every feature ↓</a></p>

      <section id="compare" className="pr-compare" aria-labelledby="pr-h-compare">
        <div className="pr-compare-head">
          <h2 className="sc-display" id="pr-h-compare"><span className="sc-l">Compare</span> <span className="sc-l">every <em>feature.</em></span></h2>
          <Switch value={aud} onChange={setAud} label="Compare plans for" />
        </div>
        <div className="pr-scroll" role="region" aria-label={`Feature comparison for ${aud === "artist" ? "artists" : "labels"}`} tabIndex={0}>
          <table className={`pr-table pr-tcols-${cols}`}>
            <caption className="sr-only">Every feature, plan by plan, for {aud === "artist" ? "artist" : "label"} accounts</caption>
            <thead>
              <tr>
                <th scope="col" className="pr-feat">Feature</th>
                {side.columns.map((c) => <th key={c.key} scope="col"><span className="pr-th-name">{c.name}</span><span className="pr-th-price">{c.price}</span></th>)}
              </tr>
            </thead>
            {side.groups.map((g) => (
              <tbody key={g.title}>
                <tr className="pr-group"><th scope="colgroup" colSpan={cols + 1}><span>{g.title}</span></th></tr>
                {g.rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="pr-feat">{r.label}{r.note && <small>{r.note}</small>}</th>
                    {r.cells.map((v, i) => <td key={side.columns[i].key}><Value v={v} /></td>)}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>
    </>
  );
}
