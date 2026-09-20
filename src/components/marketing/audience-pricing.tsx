"use client";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type Audience = "artist" | "label";
export type PriceTier = { key: string; name: string; price: string; suffix: string; blurb: string; features: string[]; featured?: boolean; cta: { label: string; href: string }; yearly?: string | null; usd?: string | null; usdYearly?: string | null };

export function AudienceToggle({ value, onChange, className }: { value: Audience; onChange: (a: Audience) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Show plans for" className={cn("relative inline-grid grid-cols-2 rounded-full border border-white/10 bg-white/[0.04] p-1 text-sm", className)}>
      <span aria-hidden className={cn("absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-[0_6px_24px_-8px_rgba(255,255,255,.5)] transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)]", value === "label" && "translate-x-full")} />
      {(["artist", "label"] as const).map((a) => (
        <button key={a} type="button" role="radio" aria-checked={value === a} onClick={() => onChange(a)} className={cn("relative z-10 rounded-full px-5 py-2 font-medium transition-colors duration-300", value === a ? "text-black" : "text-white/70 hover:text-white")}>
          {a === "artist" ? "For artists" : "For labels"}
        </button>
      ))}
    </div>
  );
}

/** Plan cards for artists or labels behind one toggle. `detailed` = full feature lists (pricing page). */
export function AudiencePricing({ artist, label, detailed = false, initial = "artist" }: { artist: PriceTier[]; label: PriceTier[]; detailed?: boolean; initial?: Audience }) {
  const [aud, setAud] = useState<Audience>(initial);
  const tiers = aud === "artist" ? artist : label;
  return (
    <div className="space-y-8">
      <div className="flex justify-center"><AudienceToggle value={aud} onChange={setAud} /></div>
      <div key={aud} className={cn("mx-auto grid gap-4", tiers.length === 3 ? "max-w-5xl md:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4")}>
        {tiers.map((t, i) => (
          <div
            key={t.key}
            className={cn("mk-card mk-pop flex flex-col p-6", t.featured && "border-violet-400/50 bg-[linear-gradient(180deg,rgba(139,92,246,.16),rgba(139,92,246,.03))] shadow-[0_30px_80px_-40px_rgba(139,92,246,.9)]")}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-white/70">{t.name}</span>
              {t.featured && <span className="rounded-full border border-violet-300/40 bg-violet-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-100">Recommended</span>}
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight">{t.price}</span>
              <span className="text-sm text-white/50">{t.suffix}</span>
            </div>
            {t.usd && <p className="mt-1 text-xs text-white/45">≈ {t.usd}{t.suffix}</p>}
            {t.yearly && <p className="mt-1 text-xs text-white/45">or {t.yearly}/yr{t.usdYearly ? ` (≈ ${t.usdYearly})` : ""}, two months free</p>}
            <p className="mt-2 text-sm text-white/60">{t.blurb}</p>
            {detailed && (
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {t.features.map((f) => <li key={f} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-hidden /><span className="text-white/80">{f}</span></li>)}
              </ul>
            )}
            <Link href={t.cta.href} className={cn("mt-6 inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold transition", t.featured ? "bg-white text-black hover:bg-white/90" : "border border-white/15 text-white hover:bg-white/[0.06]")}>
              {t.cta.label} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        ))}
      </div>
      {tiers.some((t) => t.usd) && (
        <p className="mx-auto max-w-2xl text-center text-xs text-white/40">
          Every plan is billed in Australian dollars. The US figures are a guide only — your bank converts at its own rate on the day.
        </p>
      )}
    </div>
  );
}

/** "Built for artists / labels" section: same toggle, two stories. */
export function AudienceStory({ artist, label }: { artist: { title: string; body: string }[]; label: { title: string; body: string }[] }) {
  const [aud, setAud] = useState<Audience>("artist");
  const items = aud === "artist" ? artist : label;
  return (
    <div className="space-y-10">
      <AudienceToggle value={aud} onChange={setAud} />
      <ol key={aud} className="grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it, i) => (
          <li key={it.title} className="mk-pop bg-[#0c0a14] p-6" style={{ animationDelay: `${i * 80}ms` }}>
            <span className="font-mono text-xs text-violet-300/80">0{i + 1}</span>
            <h3 className="mt-3 text-lg font-semibold leading-snug">{it.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/60">{it.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
