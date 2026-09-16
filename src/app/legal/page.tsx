import Link from "next/link";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { CONTACT, LEGAL, LEGAL_DOCS, copyrightLine, operatorLine } from "@/lib/legal";

export const metadata = { title: "Legal" };

export default function LegalIndex() {
  return (
    <MarketingShell>
      <section className="container max-w-3xl py-14">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Legal</h1>
        <p className="mt-3 text-muted-foreground">droplr.fm is a service provided by {operatorLine}, {LEGAL.address}. Last updated {LEGAL.updated}.</p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {LEGAL_DOCS.map((d) => (
            <Link key={d.slug} href={`/legal/${d.slug}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-violet-500/40 hover:bg-violet-500/[0.06]">
              <h2 className="font-semibold">{d.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{d.blurb}</p>
            </Link>
          ))}
        </div>
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm">
          <h2 className="font-semibold">Contact</h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-muted-foreground sm:grid-cols-[160px_1fr]">
            {([
              ["General & sales", CONTACT.hello],
              ["Account help", CONTACT.support],
              ["Billing", CONTACT.billing],
              ["Privacy & data", CONTACT.privacy],
              ["Copyright & legal", CONTACT.legal],
              ["Report abuse", CONTACT.abuse],
              ["Security", CONTACT.security],
            ] as const).map(([k, v]) => (
              <div key={v} className="contents"><dt>{k}</dt><dd><a className="text-foreground underline" href={`mailto:${v}`}>{v}</a></dd></div>
            ))}
          </dl>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">{copyrightLine()}</p>
      </section>
    </MarketingShell>
  );
}
