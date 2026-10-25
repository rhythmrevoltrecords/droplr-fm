import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { ROADMAP } from "@/lib/roadmap";
import { pageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const metadata = pageMeta({
  title: "Roadmap",
  description: "What's live in droplr.fm today, and what comes later. Dates when things ship, not before.",
  path: "/roadmap",
});

/** The full roadmap. It used to be a third of the homepage; it lives here now and the homepage links to it. */
export default function RoadmapPage() {
  return (
    <MarketingShell>
      <section className="container py-16 md:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300/90">Roadmap</p>
          <h1 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">What&apos;s live, and what comes later.</h1>
          <p className="mt-4 text-lg text-white/65">What&apos;s shipped, and the order I&apos;m building the rest in. Dates when things ship, not before.</p>
        </div>
        <div className="mt-12 grid items-start gap-4 lg:grid-cols-3">
          {ROADMAP.map((col) => (
            <div key={col.status} className={cn("mk-card p-6", col.status === "Live now" && "border-emerald-400/30 lg:col-span-2")}>
              <span className={cn("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium", col.status === "Live now" ? "border-emerald-300/40 text-emerald-100" : "border-white/15 text-white/70")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", col.status === "Live now" ? "bg-emerald-400" : "bg-white/40")} aria-hidden />
                {col.status}
              </span>
              <ul className={cn("mt-5 gap-x-8 gap-y-5", col.status === "Live now" ? "grid md:grid-cols-2" : "space-y-5")}>
                {col.items.map((it) => (
                  <li key={it.title}>
                    <h2 className="font-semibold">{it.title}</h2>
                    <p className="mt-1 text-[15px] leading-relaxed text-white/65">{it.body}</p>
                  </li>
                ))}
              </ul>
              {col.note && <p className="mt-5 text-[15px] leading-relaxed text-white/65">{col.note}</p>}
            </div>
          ))}
        </div>
        <p className="mt-10"><Link href="/signup" className="inline-flex items-center gap-1.5 font-medium text-violet-200 hover:text-white">Start free <ArrowRight className="h-4 w-4" aria-hidden /></Link></p>
      </section>
    </MarketingShell>
  );
}
