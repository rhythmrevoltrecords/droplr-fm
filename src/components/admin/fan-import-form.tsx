"use client";
import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { CONSENT_SOURCES } from "@/lib/fan-import";
import type { ImportResult } from "@/lib/fan-import-server";

const SOURCE_LABELS: Record<string, string> = {
  hypeddit: "Hypeddit", toneden: "ToneDen", mailchimp: "Mailchimp",
  mailerlite: "MailerLite", "own-site": "My own site", bandcamp: "Bandcamp", other: "Somewhere else",
};

/**
 * Importing a list you already had.
 *
 * The consent questions are the form, not a footnote on it. Every one of them is something you
 * would need to answer if a recipient complained, and answering it here — once, at import —
 * is much easier than reconstructing it a year later from memory.
 */
export function FanImportForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("hypeddit");
  const [kind, setKind] = useState("marketing");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);

  async function submit() {
    if (!file) return setError("Pick a CSV first.");
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("consentSource", source);
    fd.set("consentKind", kind);
    fd.set("consentNote", note);
    fd.set("consentAt", when);
    fd.set("attested", attested ? "yes" : "no");
    const res = await fetch("/api/admin/fans/import", { method: "POST", body: fd });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setError(j.error ?? "Import failed.");
    setDone(j as ImportResult);
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  if (done) {
    return (
      <Card className="space-y-3 p-5">
        <p className="text-sm font-semibold">Imported {done.added.toLocaleString()} {done.added === 1 ? "contact" : "contacts"}</p>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {done.duplicates > 0 && <li>{done.duplicates.toLocaleString()} were already in your contacts — left as they were.</li>}
          {done.alreadyFans > 0 && <li>{done.alreadyFans.toLocaleString()} already pre-saved something of yours, so they&apos;re already fans. Kept the better record.</li>}
          {done.suppressed > 0 && <li><strong className="text-foreground">{done.suppressed.toLocaleString()} previously unsubscribed from you and were not re-added.</strong></li>}
          {done.skipped > 0 && <li>{done.skipped.toLocaleString()} rows had no valid email address.</li>}
        </ul>
        <p className="text-sm">
          {done.status === "mailable"
            ? "They can be included in a news email. They are not in any release-day send — send them a news email with your pre-save link and the ones who sign up become fans properly."
            : "They're saved as pending. Because they only ever gave you their address for a download, they need to confirm before you can email them."}
        </p>
        <Button variant="outline" onClick={() => setDone(null)}>Import another file</Button>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="space-y-1.5">
        <Label htmlFor="csv">CSV file</Label>
        <Input id="csv" ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <p className="text-xs text-muted-foreground">Any export with an email column. Names and country are picked up if they&apos;re there.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="src">Where did you collect these?</Label>
          <Select id="src" value={source} onChange={(e) => setSource(e.target.value)}>
            {CONSENT_SOURCES.map((k) => <option key={k} value={k}>{SOURCE_LABELS[k] ?? k}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="when">Roughly when? (optional)</Label>
          <Input id="when" type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="kind">What did they agree to?</Label>
        <Select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="marketing">They ticked a box to hear about new music from me</option>
          <option value="transactional">They just gave their email to get a download</option>
        </Select>
        <p className="text-xs text-muted-foreground">
          {kind === "marketing"
            ? "That's a subscription to you, and it carries over. They'll be able to receive your news emails."
            : "That's a one-off, not a subscription. They'll be saved but can't be emailed until they confirm."}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">What did the sign-up actually say?</Label>
        <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Tick to get my future releases and free downloads" />
        <p className="text-xs text-muted-foreground">In their words, as close as you remember. This is what you&apos;d point at if someone ever queried it.</p>
      </div>

      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span className="text-muted-foreground">
          These people gave me their address directly and I have not bought, scraped or swapped this list.
          I understand I&apos;m the one responsible for having their consent.
        </span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={() => void submit()} disabled={busy || !file || !note || !attested}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload />} Import
        </Button>
        <p className="text-xs text-muted-foreground">Anyone who already unsubscribed from you is skipped automatically.</p>
      </div>
    </Card>
  );
}
