"use client";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DomainSetupView } from "@/lib/domains";
import { CopyButton } from "./copy-button";

const STATE: Record<DomainSetupView["state"], { label: string; variant: "success" | "warning" | "secondary" | "danger" }> = {
  verify: { label: "Waiting for TXT record", variant: "warning" },
  connecting: { label: "Connecting", variant: "warning" },
  live: { label: "Live", variant: "success" },
  paused: { label: "Paused", variant: "secondary" },
};

function RecordRow({ type, host, fqdn, value, done }: { type: string; host: string; fqdn: string; value: string; done?: boolean }) {
  return (
    <div className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-[7rem_1fr_1fr] sm:items-start">
      <div className="flex items-center gap-1.5 font-medium">{done && <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-label="Done" />}{type}</div>
      <div className="min-w-0 space-y-1">
        <div className="text-xs text-muted-foreground">Name / host</div>
        <div className="flex items-center gap-2"><code className="break-all text-foreground">{host}</code><CopyButton value={host} label="Copy" variant="ghost" /></div>
        {host !== fqdn && host !== "@" && <div className="text-xs text-muted-foreground">Full name: <span className="break-all">{fqdn}</span></div>}
      </div>
      <div className="min-w-0 space-y-1">
        <div className="text-xs text-muted-foreground">Value / points to</div>
        <div className="flex items-center gap-2"><code className="break-all text-foreground">{value}</code><CopyButton value={value} label="Copy" variant="ghost" /></div>
      </div>
    </div>
  );
}

export function DomainSetup({ view }: { view: DomainSetupView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const st = STATE[view.state];
  const verified = !!view.verifiedAt;

  async function check() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/org/domain", { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg({ ok: !!j.ok, text: j.message ?? j.error ?? "Check failed" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium break-all">{view.domain}</span>
        <Badge variant={st.variant}>{st.label}</Badge>
        {view.checkedAt && <span suppressHydrationWarning className="text-xs text-muted-foreground">Last checked {new Date(view.checkedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</span>}
      </div>

      {view.advice && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">{view.advice}</p>
      )}

      {view.state === "live" ? (
        <p className="text-sm text-muted-foreground">Connected. New links use <strong className="text-foreground">https://{view.domain}</strong>. Leave the DNS record that points it at droplr in place; if it&apos;s removed, links go back to droplr.fm.</p>
      ) : view.state !== "paused" ? (
        <p className="text-sm text-muted-foreground">Until this shows Live, your links keep using droplr.fm, so nothing you share is broken while you set it up.</p>
      ) : null}

      {view.state === "live" && (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">DNS records for a new setup</summary>
          <p className="mt-2">Already connected, nothing to add. These are only needed if you move the domain to another DNS provider.</p>
          <div className="mt-2 space-y-2">
            <RecordRow {...view.txt} />
            {view.point.map((r) => <RecordRow key={r.type} {...r} />)}
          </div>
        </details>
      )}

      {view.state !== "paused" && view.state !== "live" && (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">1. Prove you own the domain</h3>
            <RecordRow {...view.txt} done={verified} />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">2. Point the domain at droplr</h3>
            {view.point.map((r) => <RecordRow key={r.type} {...r} done={view.state === "live"} />)}
            {view.apex && <p className="text-xs text-muted-foreground">This is your root domain, so it would move your whole website to droplr. A subdomain like presave.{view.root} is usually what you want.</p>}
          </div>
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer">Using Cloudflare, Netlify DNS or another host?</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Some DNS providers want only the part before your domain as the name (like the Name / host column). Others want the full name.</li>
              <li><strong>Cloudflare:</strong> set the CNAME to <strong>DNS only</strong> (grey cloud), or the certificate can&apos;t be issued.</li>
              <li><strong>Netlify DNS:</strong> add both records under Domains → {view.root} → DNS records. Don&apos;t add {view.domain} to one of your own Netlify sites; that stops droplr connecting it.</li>
              <li>New records usually show up within minutes, occasionally up to an hour. droplr checks every 15 minutes on its own.</li>
            </ul>
          </details>
        </>
      )}

      {view.error && view.state !== "live" && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{view.error}</p>}

      {view.state !== "paused" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={check} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check now</Button>
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-400" : "text-muted-foreground"}`}>{msg.ok ? msg.text : ""}</span>}
        </div>
      )}
    </div>
  );
}
