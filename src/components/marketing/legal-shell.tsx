import Link from "next/link";
import { CONTACT, LEGAL, LEGAL_DOCS, operatorLine, type LegalSlug } from "@/lib/legal";
import { cn } from "@/lib/utils";
import { MarketingShell } from "./site-chrome";

export type TocItem = { id: string; title: string };

/** Shared layout for every /legal document: doc switcher, table of contents, readable prose. */
export function LegalShell({ slug, toc, children, contact = "hello" }: { slug: LegalSlug; toc: TocItem[]; children: React.ReactNode; /** Inbox shown in the "Questions?" line. */ contact?: keyof typeof CONTACT }) {
  const doc = LEGAL_DOCS.find((d) => d.slug === slug)!;
  return (
    <MarketingShell>
      <div className="container grid grid-cols-[minmax(0,1fr)] gap-10 py-12 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-16">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <nav aria-label="Legal documents" className="flex gap-1 overflow-x-auto pb-2 text-sm lg:flex-col lg:overflow-visible lg:pb-0">
            <Link href="/legal" className="shrink-0 rounded-md px-3 py-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground">All policies</Link>
            {LEGAL_DOCS.map((d) => (
              <Link
                key={d.slug}
                href={`/legal/${d.slug}`}
                aria-current={d.slug === slug ? "page" : undefined}
                className={cn("shrink-0 rounded-md px-3 py-1.5 hover:bg-white/5 hover:text-foreground", d.slug === slug ? "bg-white/[0.07] text-foreground" : "text-muted-foreground")}
              >
                {d.short}
              </Link>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 max-w-3xl">
          <p className="text-sm text-muted-foreground">Last updated {LEGAL.updated}</p>
          <h1 className="mt-2 text-balance text-3xl font-bold tracking-tight sm:text-4xl">{doc.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">A service provided by {operatorLine}. {LEGAL.address}.</p>

          {toc.length > 3 && (
            <nav aria-label="On this page" className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm">
              <p className="mb-2 font-medium">On this page</p>
              <ol className="grid list-decimal gap-x-8 gap-y-1 pl-5 text-muted-foreground sm:grid-cols-2">
                {toc.map((t) => <li key={t.id}><a href={`#${t.id}`} className="hover:text-foreground hover:underline">{t.title}</a></li>)}
              </ol>
            </nav>
          )}

          <div className="legal-prose mt-10 space-y-4 leading-relaxed text-zinc-300 [&_a]:underline [&_a]:underline-offset-2 [&_h2]:scroll-mt-24 [&_h2]:pt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:pt-2 [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_strong]:text-foreground [&_table]:w-full [&_table]:text-left [&_table]:text-sm [&_td]:border-t [&_td]:border-white/10 [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top [&_th]:pb-2 [&_th]:pr-4 [&_th]:font-medium [&_th]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
            {children}
          </div>

          <p className="mt-12 border-t border-white/10 pt-6 text-sm text-muted-foreground">
            Questions about this document? Email <a className="underline" href={`mailto:${CONTACT[contact]}`}>{CONTACT[contact]}</a>. All contacts are on the <Link className="underline" href="/legal">Legal</Link> page.
          </p>
        </article>
      </div>
    </MarketingShell>
  );
}

/** Numbered section heading that also feeds the table of contents. */
export function Section({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 id={id}>{n}. {title}</h2>
      {children}
    </section>
  );
}
