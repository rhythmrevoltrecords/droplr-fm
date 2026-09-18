"use client";
import { Check, ChevronDown, Loader2, ScrollText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Shown to a login that agreed to an older version of the Terms. It doesn't lock anyone out of their
 * own data: it sits at the top of every dashboard page until accepted, with the actual changes listed.
 */
export function LegalUpdateNotice({ updates, updated }: { updates: { version: string; date: string; summary: string[] }[]; updated: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <div className="no-print mb-6 rounded-xl border border-violet-500/30 bg-violet-500/[0.08] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <ScrollText className="h-4 w-4 shrink-0 text-violet-300" aria-hidden />
        <p className="min-w-0 flex-1 text-sm">
          <strong>We&apos;ve updated our Terms and policies</strong> ({updated}). Have a read, then accept to keep using droplr.fm.
        </p>
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await fetch("/api/legal/accept", { method: "POST" });
            setBusy(false);
            if (res.ok) {
              setDone(true);
              router.refresh();
            }
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Check />} I agree
        </Button>
      </div>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden /> What changed
      </button>
      {open && (
        <div className="mt-2 space-y-3 text-sm text-muted-foreground">
          {updates.map((u) => (
            <div key={u.version}>
              <p className="text-xs uppercase tracking-wide">{u.date}</p>
              <ul className="ml-5 list-disc space-y-1">{u.summary.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          ))}
          <p className="text-xs">
            Read the full documents: <Link href="/legal/terms" className="underline">Terms</Link> · <Link href="/legal/privacy" className="underline">Privacy</Link> · <Link href="/legal/acceptable-use" className="underline">Acceptable use</Link> · <Link href="/legal/cookies" className="underline">Cookies</Link>. Questions before you accept? Use the feedback button.
          </p>
        </div>
      )}
    </div>
  );
}
