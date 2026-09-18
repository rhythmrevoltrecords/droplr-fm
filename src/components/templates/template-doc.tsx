import type { Section, Template } from "@/lib/templates";

const Line = ({ w = "100%" }: { w?: string }) => <span className="inline-block border-b border-black/30 align-bottom" style={{ width: w, height: "1.1em" }} />;

/** The printable sheet. Always black on white so it prints and photocopies cleanly. */
export function TemplateDoc({ template, sample = false }: { template: Template; sample?: boolean }) {
  return (
    <div className="print-sheet relative mx-auto w-full max-w-[820px] overflow-hidden bg-white px-8 py-10 text-[13px] leading-relaxed text-black shadow-2xl sm:px-12">
      {sample && (
        <div aria-hidden className="pointer-events-none absolute inset-0 grid select-none place-items-center">
          <span className="-rotate-[28deg] text-[88px] font-black tracking-[0.3em] text-black/[0.07]">SAMPLE</span>
        </div>
      )}
      <header className="relative flex items-start justify-between gap-6 border-b border-black/20 pb-4">
        <div>
          <h1 className="text-xl font-bold">{template.title}</h1>
          <p className="mt-0.5 text-[12px] text-black/60">{sample ? "Filled-in example — not a real agreement" : "Template"}</p>
        </div>
        <p className="shrink-0 text-right text-[11px] text-black/50">droplr.fm<br />Made with droplr.fm</p>
      </header>
      <div className="relative mt-6 space-y-5">
        {template.doc.map((s, i) => <Block key={i} s={s} sample={sample} />)}
      </div>
    </div>
  );
}

function Block({ s, sample }: { s: Section; sample: boolean }) {
  if ("h" in s)
    return (
      <div className="pt-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-black/70">{s.h}</h2>
        {s.note && <p className="mt-1 text-[11px] text-black/55">{s.note}</p>}
      </div>
    );
  if ("small" in s) return <p className="pt-2 text-[10.5px] leading-snug text-black/50">{s.small}</p>;
  if ("fields" in s)
    return (
      <dl className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {s.fields.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-[11px] text-black/60">{f.label}</dt>
            <dd className="mt-0.5 min-h-[1.4em] border-b border-black/25 pb-0.5 font-medium">{sample ? f.sample ?? "" : f.hint ? <span className="font-normal italic text-black/35">{f.hint}</span> : ""}</dd>
          </div>
        ))}
      </dl>
    );
  if ("lines" in s)
    return (
      <div>
        {s.lines.label && <p className="text-[11px] text-black/60">{s.lines.label}</p>}
        {sample && s.lines.sample ? (
          <p className="mt-1 border-b border-black/20 pb-1">{s.lines.sample}</p>
        ) : (
          <div className="mt-1 space-y-4">{Array.from({ length: s.lines.count }, (_, i) => <div key={i} className="border-b border-black/25" />)}</div>
        )}
      </div>
    );
  if ("grid" in s)
    return (
      <div>
        <table className="w-full table-fixed border-collapse text-[11.5px]">
          <thead>
            <tr>{s.grid.head.map((h) => <th key={h} className="border border-black/25 bg-black/[0.04] px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {(sample && s.grid.sampleRows ? s.grid.sampleRows : []).map((r, i) => (
              <tr key={i}>{r.map((c, ci) => <td key={ci} className="border border-black/25 px-2 py-1.5 align-top">{c}</td>)}</tr>
            ))}
            {Array.from({ length: Math.max(0, s.grid.rows - (sample ? s.grid.sampleRows?.length ?? 0 : 0)) }, (_, i) => (
              <tr key={`b${i}`}>{s.grid.head.map((h) => <td key={h} className="h-7 border border-black/25 px-2" />)}</tr>
            ))}
          </tbody>
        </table>
        {s.grid.note && <p className="mt-1 text-[10.5px] text-black/55">{s.grid.note}</p>}
      </div>
    );
  if ("checks" in s)
    return (
      <div className="space-y-4">
        {s.checks.map((g) => (
          <div key={g.group}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-black/70">{g.group}</p>
            <ul className="mt-1.5 space-y-1.5">
              {g.items.map((it) => (
                <li key={it.task} className="flex items-center gap-3">
                  <span className="h-3.5 w-3.5 shrink-0 border border-black/40" aria-hidden />
                  <span className="min-w-0 flex-1">{it.task}</span>
                  <span className="shrink-0 text-black/40">Date <Line w="72px" /></span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  return (
    <div className="grid gap-6 pt-2 sm:grid-cols-2">
      {s.sign.map((x, i) => (
        <div key={i}>
          <div className="mt-6 border-b border-black/40" />
          <p className="mt-1 text-[10.5px] text-black/55">{x.role}</p>
        </div>
      ))}
    </div>
  );
}
