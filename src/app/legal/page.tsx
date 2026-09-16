import Link from "next/link";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { LEGAL, LEGAL_DOCS, operatorLine } from "@/lib/legal";

export const metadata = { title: "Legal" };

export default function LegalIndex() {
  return (
    <MarketingShell>
      <section className="container max-w-3xl py-14">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Legal</h1>
        <p className="mt-3 text-muted-foreground">droplr.fm is operated by {operatorLine}, {LEGAL.address}. Last updated {LEGAL.updated}.</p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {LEGAL_DOCS.map((d) => (
            <Link key={d.slug} href={`/legal/${d.slug}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-violet-500/40 hover:bg-violet-500/[0.06]">
              <h2 className="font-semibold">{d.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{d.blurb}</p>
            </Link>
          ))}
        </div>
        <p className="mt-10 text-sm text-muted-foreground">Privacy requests, billing questions, abuse and copyright reports: <a className="underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></p>
      </section>
    </MarketingShell>
  );
}
