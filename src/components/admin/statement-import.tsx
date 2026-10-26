"use client";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { aggregateText, detectDelimiter, guessMapping, money, parseAmount, parseDelimited, SPLIT_LIMITS, type Aggregate, type Mapping } from "@/lib/royalties";

const MAX_BYTES = 30 * 1024 * 1024;
const CURRENCIES = ["AUD", "USD", "EUR", "GBP", "NZD", "CAD", "JPY", "SEK", "NOK", "DKK", "CHF"];
const field = "h-10 w-full rounded-md border bg-background px-2.5 text-sm";

/**
 * Import a distributor statement. The file is read and summed here, in the browser: droplr
 * receives a total per UPC/ISRC and never the statement's lines, so there's nothing per stream,
 * per store or per country of the label's on droplr's servers.
 */
export function StatementImport({ defaultCurrency }: { defaultCurrency: string }) {
  const router = useRouter();
  // The file's text and a sample, never every row as strings: a big statement would be millions of them.
  const [file, setFile] = useState<{ name: string; text: string; delim: string; headers: string[]; sample: string[][]; rows: number } | null>(null);
  const [m, setM] = useState<Mapping | null>(null);
  const [title, setTitle] = useState("");
  const [currency, setCurrency] = useState(CURRENCIES.includes(defaultCurrency) ? defaultCurrency : "AUD");
  const [period, setPeriod] = useState({ start: "", end: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(f: File | undefined) {
    setErr(null);
    if (!f) return;
    if (f.size > MAX_BYTES) { setErr("That file is over 30MB. Split it and import each part as its own statement."); return; }
    const text = await f.text();
    const delim = detectDelimiter(text);
    const head = parseDelimited(text, delim, 201);
    if (head.length < 2) { setErr("That file has no rows under its header."); return; }
    const headers = head[0].map((h) => h.trim());
    setFile({ name: f.name, text, delim, headers, sample: head.slice(1), rows: 0 });
    setM(guessMapping(headers, head.slice(1)));
    setTitle((t) => t || f.name.replace(/\.(csv|tsv|txt)$/i, ""));
  }

  // Summed once per file and column choice, not on every keystroke in the name field: a statement can be a million rows.
  const agg: Aggregate | null = useMemo(() => (file && m && m.amount >= 0 && (m.upc >= 0 || m.isrc >= 0) ? aggregateText(file.text, file.delim, m) : null), [file, m]);
  const tooMany = !!agg && agg.rowsTotal > SPLIT_LIMITS.rows;
  // Three amounts from the file as droplr reads them, so a wrong decimal point is obvious before importing.
  const samples = file && m && m.amount >= 0 ? file.sample.map((r) => ({ raw: (r[m.amount] ?? "").trim(), n: parseAmount(r[m.amount] ?? "", m.decimal) })).filter((x) => x.raw).slice(0, 3) : [];
  const mixed = agg && agg.currencies.length > 1;
  const total = useMemo(() => (agg ? agg.pairs.reduce((n, p) => n + BigInt(p.micros), 0n) : 0n), [agg]);

  async function submit() {
    if (!agg) return;
    setBusy(true);
    const res = await fetch("/api/admin/royalties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, currency, periodStart: period.start || null, periodEnd: period.end || null, rowsTotal: agg.rowsTotal, pairs: agg.pairs }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) { setErr((data as { error?: string }).error ?? "Couldn't import that. Try again."); return; }
    router.push(`/admin/royalties/${(data as { id: string }).id}`);
  }

  const col = (k: "upc" | "isrc" | "amount" | "currency", label: string, optional = false) => (
    <div className="space-y-1">
      <label htmlFor={`col-${k}`} className="text-xs text-muted-foreground">{label}</label>
      <select id={`col-${k}`} value={m![k]} onChange={(e) => setM({ ...m!, [k]: Number(e.target.value) })} className={field}>
        <option value={-1}>{optional ? "None" : "Pick a column"}</option>
        {file!.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </select>
    </div>
  );

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 text-sm hover:bg-white/5">
        <Upload className="h-5 w-5 text-muted-foreground" aria-hidden />
        <span>{file ? `${file.name}${agg ? `: ${agg.rowsTotal.toLocaleString()} rows` : ""}` : "Choose the statement your distributor gave you (CSV or TSV)"}</span>
        <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {file && m && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {col("upc", "UPC / EAN column", true)}
            {col("isrc", "ISRC column", true)}
            {col("amount", "Amount column")}
            <div className="space-y-1">
              <label htmlFor="col-dec" className="text-xs text-muted-foreground">Decimal point</label>
              <select id="col-dec" value={m.decimal} onChange={(e) => setM({ ...m, decimal: e.target.value as "." | "," })} className={field}><option value=".">1,234.56</option><option value=",">1.234,56</option></select>
            </div>
          </div>
          {samples.length > 0 && (
            <p className="text-xs text-muted-foreground">Read as: {samples.map((x, i) => <span key={i} className="mr-3 tabular-nums">{x.raw} → {x.n === null ? "not a number" : money(x.n / 1_000_000n, currency)}</span>)} If those look wrong, change the decimal point.</p>
          )}
          <p className="text-xs text-muted-foreground">Rows match your releases by UPC first, then ISRC. A multi-track release only matches by ISRC if that ISRC is the one on the release, so map the UPC column when the file has one.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1 sm:col-span-2"><label htmlFor="st-title" className="text-xs text-muted-foreground">Name</label><input id="st-title" maxLength={SPLIT_LIMITS.title} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="DistroKid, July to September" className={field} /></div>
            <div className="space-y-1"><label htmlFor="st-from" className="text-xs text-muted-foreground">Period from</label><input id="st-from" type="date" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} className={field} /></div>
            <div className="space-y-1"><label htmlFor="st-to" className="text-xs text-muted-foreground">to</label><input id="st-to" type="date" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} className={field} /></div>
            <div className="space-y-1">
              <label htmlFor="st-cur" className="text-xs text-muted-foreground">Currency of the amounts</label>
              <select id="st-cur" value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
            {col("currency", "Currency column, to check", true)}
          </div>
          {!agg ? <p className="text-sm text-amber-400">Pick the amount column and a UPC or ISRC column.</p> : (
            <div className="rounded-xl border p-3 text-sm" aria-live="polite">
              <p>{agg.pairs.length.toLocaleString()} tracks, {money(total, currency)} in total, from {(agg.rowsTotal - agg.skipped).toLocaleString()} rows.{agg.skipped ? ` ${agg.skipped.toLocaleString()} rows had no UPC, ISRC or readable amount and are left out.` : ""}</p>
              {tooMany && <p className="mt-1 text-amber-400">That file has more than a million rows. Split it and import each part.</p>}
              {mixed && <p className="mt-1 text-amber-400">This file mixes currencies ({agg.currencies.join(", ")}). droplr doesn&apos;t convert between them: import each currency as its own statement, or use the distributor&apos;s converted column.</p>}
              {agg.currencies.length === 1 && agg.currencies[0] !== currency && <p className="mt-1 text-amber-400">The file says {agg.currencies[0]}, but you picked {currency}.</p>}
            </div>
          )}
          <Button type="button" onClick={submit} disabled={busy || !agg || tooMany || !title.trim() || !!mixed || (agg?.currencies.length === 1 && agg.currencies[0] !== currency)}>{busy ? "Importing…" : "Import"}</Button>
        </>
      )}
      {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
    </div>
  );
}
