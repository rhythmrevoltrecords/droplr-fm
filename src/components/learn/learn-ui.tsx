import { ArrowRight, BookOpen, Check, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { GUIDES, LEGAL_NOTE, type Block, type Guide } from "@/lib/learn";

/** One content block. Same renderer for the public intro and the members part. */
function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-5 leading-relaxed text-muted-foreground">
      {blocks.map((b, i) => {
        if ("h" in b) return <h2 key={i} className="pt-4 text-xl font-semibold text-foreground">{b.h}</h2>;
        if ("p" in b) return <p key={i}>{b.p}</p>;
        if ("ul" in b) return <ul key={i} className="ml-5 list-disc space-y-2">{b.ul.map((t) => <li key={t}>{t}</li>)}</ul>;
        if ("ol" in b) return <ol key={i} className="ml-5 list-decimal space-y-2">{b.ol.map((t) => <li key={t}>{t}</li>)}</ol>;
        if ("note" in b)
          return (
            <p key={i} className={`flex gap-3 rounded-xl border p-4 text-sm ${b.tone === "warn" ? "border-amber-500/30 bg-amber-500/10 text-amber-100" : "border-violet-500/30 bg-violet-500/10 text-foreground"}`}>
              {b.tone === "warn" ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
              <span>{b.note}</span>
            </p>
          );
        if ("steps" in b)
          return (
            <ol key={i} className="space-y-4">
              {b.steps.map((s, n) => (
                <li key={s.title} className="flex gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-foreground">{n + 1}</span>
                  <span><strong className="text-foreground">{s.title}.</strong> {s.body}</span>
                </li>
              ))}
            </ol>
          );
        return (
          <div key={i} className="space-y-2">
            <Card className="overflow-x-auto p-0">
              <Table>
                <THead><TR>{b.table.head.map((h) => <TH key={h}>{h}</TH>)}</TR></THead>
                <TBody>
                  {b.table.rows.map((r) => <TR key={r[0]}>{r.map((c, ci) => <TD key={ci} className={ci === 0 ? "font-medium text-foreground" : ""}>{c}</TD>)}</TR>)}
                </TBody>
              </Table>
            </Card>
            {b.table.caption && <p className="text-xs">{b.table.caption}</p>}
          </div>
        );
      })}
    </div>
  );
}

function Sources({ guide }: { guide: Guide }) {
  return (
    <section className="mt-12 border-t pt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Where this comes from</h2>
      <ul className="mt-3 space-y-1.5 text-sm">
        {guide.sources.map((s) => (
          <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">{s.label}</a></li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">Facts checked {guide.checked}. {LEGAL_NOTE}</p>
    </section>
  );
}

export function GuideHeader({ guide }: { guide: Guide }) {
  return (
    <header>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{guide.tag}</Badge>
        <span>{guide.minutes} min read</span>
        <span aria-hidden>·</span>
        <span>Checked {guide.checked}</span>
      </div>
      <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{guide.title}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{guide.summary}</p>
    </header>
  );
}

/** Public page: the broad part, then what's behind a (free) account. */
export function PublicGuide({ guide, signupHref }: { guide: Guide; signupHref: string }) {
  return (
    <article>
      <GuideHeader guide={guide} />
      <div className="mt-8"><Blocks blocks={guide.public} /></div>
      <Card className="mt-10 border-violet-500/30 bg-violet-500/[0.07] p-6">
        <h2 className="text-lg font-semibold">The rest of this guide is inside droplr</h2>
        <p className="mt-1 text-sm text-muted-foreground">Free accounts included. No card, and the knowledge board is open on every plan.</p>
        <ul className="mt-4 space-y-2 text-sm">
          {guide.inside.map((t) => <li key={t} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden /><span>{t}</span></li>)}
        </ul>
        <Link href={signupHref} className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90">
          Read the full guide <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <p className="mt-3 text-xs text-muted-foreground">Already have an account? <Link href="/login" className="underline">Log in</Link></p>
      </Card>
      <Sources guide={guide} />
    </article>
  );
}

/** Signed-in page: everything. */
export function MemberGuide({ guide, backHref }: { guide: Guide; backHref: string }) {
  return (
    <article className="max-w-3xl">
      <p className="text-sm text-muted-foreground"><Link href={backHref} className="hover:underline">Knowledge</Link> / {guide.tag}</p>
      <div className="mt-2"><GuideHeader guide={guide} /></div>
      <div className="mt-8"><Blocks blocks={guide.public} /></div>
      <div className="mt-8 border-t pt-8"><Blocks blocks={guide.member} /></div>
      <Sources guide={guide} />
    </article>
  );
}

export function GuideCards({ base }: { base: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {GUIDES.map((g) => (
        <Link key={g.slug} href={`${base}/${g.slug}`} className="group rounded-2xl border p-5 transition-colors hover:border-violet-400/40 hover:bg-white/[0.03]">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5 text-violet-300" aria-hidden /> {g.tag} · {g.minutes} min
          </div>
          <h2 className="mt-2.5 font-semibold group-hover:text-foreground">{g.title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{g.summary}</p>
        </Link>
      ))}
    </div>
  );
}
